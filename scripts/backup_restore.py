"""J09 backup and isolated restore drill for the local stack (docs/runbook.md gives the hosted-project equivalent).

Usage: python scripts/backup_restore.py drill [backup_dir]   # back up, restore into an isolated stack, verify, stop it
       python scripts/backup_restore.py cleanup              # stop the isolated stack and delete its volumes

backup:  `supabase db dump` roles, schema and data (SQL) plus every private storage object with a SHA-256 manifest.
restore: a separate Supabase stack (project id UpstreamRestoreDrill, ports 553xx, its own volumes) receives the SQL through
         psql and the objects through its own storage API. The source database is only read.
verify:  table row counts equal the source, every restored object matches its manifest hash, every evidence package
         verifies from restored storage against its recorded manifest hash, and an example account signs in to the restored auth.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'packages/engine'))
from services.api.config import settings  # noqa: E402
from services.packages import verify_package  # noqa: E402
from services.worker.exports import signing_key  # noqa: E402

SUPABASE = str(ROOT / 'node_modules/.bin' / ('supabase.CMD' if os.name == 'nt' else 'supabase'))
DRILL = Path(tempfile.gettempdir()) / 'upstream-restore-drill'
PROJECT = 'UpstreamRestoreDrill'
TABLES = ['organizations', 'memberships', 'cases', 'reports', 'report_versions', 'media_assets', 'network_versions', 'network_edges',
          'stations', 'reading_versions', 'assessments', 'class_results', 'assessment_publications', 'evidence_packages',
          'deliveries', 'recipients', 'case_events', 'audit_log', 'tasks']
EXCLUDE = 'studio,imgproxy,edge-runtime,logflare,vector,realtime,supavisor,mailpit,postgres-meta'


def run(*args, **kw):
    return subprocess.run([str(a) for a in args], check=True, capture_output=True, text=True, **kw)


def counts(url):
    with psycopg.connect(url, row_factory=dict_row) as db:
        result = {t: db.execute(f'select count(*) n from public.{t}').fetchone()['n'] for t in TABLES}
        result['auth.users'] = db.execute('select count(*) n from auth.users').fetchone()['n']
        return result


def backup(out: Path):
    cfg = settings()
    out.mkdir(parents=True, exist_ok=True)
    for name, flags in (('roles.sql', ['--role-only']), ('schema.sql', []), ('data.sql', ['--data-only', '--use-copy'])):
        run(SUPABASE, 'db', 'dump', '--local', *flags, '-f', out / name, cwd=ROOT)
    with psycopg.connect(cfg.database_url, row_factory=dict_row) as db:
        names = {r['name']: r['mimetype'] for r in db.execute(
            "select name,metadata->>'mimetype' mimetype from storage.objects where bucket_id=%s order by name", (cfg.storage_bucket,))}
    headers = {'apikey': cfg.supabase_service_role_key, 'Authorization': f'Bearer {cfg.supabase_service_role_key}'}
    manifest = {}
    with httpx.Client(timeout=30, headers=headers) as http:
        for name, mimetype in names.items():
            r = http.get(f'{cfg.supabase_url}/storage/v1/object/{cfg.storage_bucket}/{name}')
            r.raise_for_status()
            target = out / 'objects' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(r.content)
            manifest[name] = {'sha256': hashlib.sha256(r.content).hexdigest(), 'size': len(r.content),
                              'content_type': mimetype}  # as stored; the download header is not the stored type
    (out / 'objects.json').write_text(json.dumps(manifest, indent=1, sort_keys=True), encoding='utf-8')
    (out / 'source-counts.json').write_text(json.dumps(counts(cfg.database_url), indent=1), encoding='utf-8')
    return manifest


def start_isolated():
    """A second local stack: same image versions, its own project id, ports and volumes; no migrations of its own."""
    if DRILL.exists():
        shutil.rmtree(DRILL)
    (DRILL / 'supabase').mkdir(parents=True)
    config = (ROOT / 'supabase/config.toml').read_text(encoding='utf-8')
    config = config.replace('project_id = "Upstream"', f'project_id = "{PROJECT}"')
    config = re.sub(r'^((?:shadow_|inspector_)?port = )54(\d{3})$', r'\g<1>55\2', config, flags=re.M)
    config = config.replace('inspector_port = 8083', 'inspector_port = 8093')
    (DRILL / 'supabase/config.toml').write_text(config, encoding='utf-8')
    run(SUPABASE, 'start', '--workdir', DRILL, '-x', EXCLUDE, cwd=DRILL)
    status = json.loads(run(SUPABASE, 'status', '--workdir', DRILL, '-o', 'json', cwd=DRILL).stdout)
    assert ':55322/' in status['DB_URL'] and ':55321' in status['API_URL'], 'restore stack must not share the source ports'
    return status


def psql(sql: str | Path, container=f'supabase_db_{PROJECT}'):
    body = sql.read_text(encoding='utf-8') if isinstance(sql, Path) else sql
    done = subprocess.run(['docker', 'exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
                          input=body, text=True, encoding='utf-8', capture_output=True)
    if done.returncode:
        raise SystemExit(f'restore failed in {sql if isinstance(sql, Path) else "inline SQL"}: {done.stderr[-2000:]}')


def restore(src: Path, status: dict):
    psql(src / 'roles.sql')
    psql(src / 'schema.sql')
    psql('set session_replication_role = replica;\n' + (src / 'data.sql').read_text(encoding='utf-8'))
    key = status['SERVICE_ROLE_KEY']
    manifest = json.loads((src / 'objects.json').read_text(encoding='utf-8'))
    bucket = settings().storage_bucket
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    with httpx.Client(timeout=30, headers=headers) as http:
        for name, meta in manifest.items():
            r = http.post(f"{status['API_URL']}/storage/v1/object/{bucket}/{name}", content=(src / 'objects' / name).read_bytes(),
                          headers={'Content-Type': meta['content_type'], 'x-upsert': 'true'})
            assert r.status_code < 300, (name, r.status_code, r.text)


def verify(src: Path, status: dict):
    source = json.loads((src / 'source-counts.json').read_text(encoding='utf-8'))
    restored = counts(status['DB_URL'])
    assert restored == source, {k: (source[k], restored.get(k)) for k in source if source[k] != restored.get(k)}
    key, bucket = status['SERVICE_ROLE_KEY'], settings().storage_bucket
    manifest = json.loads((src / 'objects.json').read_text(encoding='utf-8'))
    with httpx.Client(timeout=30, headers={'apikey': key, 'Authorization': f'Bearer {key}'}) as http:
        def get(name):
            r = http.get(f"{status['API_URL']}/storage/v1/object/{bucket}/{name}")
            r.raise_for_status()
            return r.content
        for name, meta in manifest.items():
            assert hashlib.sha256(get(name)).hexdigest() == meta['sha256'], name
        with psycopg.connect(status['DB_URL'], row_factory=dict_row) as db:
            packages = db.execute('''select p.*,(select manifest_hash from evidence_packages x where x.id=p.predecessor_id) predecessor_hash
                from evidence_packages p order by created_at''').fetchall()
        key_pair = signing_key()[0]
        for p in packages:  # the same check as GET /packages/{id}/verify, against restored storage only
            signed = p['signing_status'] == 'signed'
            verify_package({n: get(k) for n, k in p['artifact_keys'].items()}, public_key=key_pair.public_key() if signed else None,
                           expected_manifest_hash=p['manifest_hash'], expected_predecessor_hash=p['predecessor_hash'], require_signature=signed)
        signed_in = httpx.post(f"{status['API_URL']}/auth/v1/token?grant_type=password", headers={'apikey': status['ANON_KEY']},
                               json={'email': 'expert@example.test', 'password': 'upstream-example-only'}, timeout=15).status_code == 200
    return {'tables': restored, 'objects': len(manifest), 'packages_verified': len(packages), 'example_sign_in': signed_in}


def cleanup():
    if DRILL.exists():
        subprocess.run([SUPABASE, 'stop', '--workdir', str(DRILL), '--no-backup'], cwd=DRILL, capture_output=True)
        shutil.rmtree(DRILL, ignore_errors=True)


def drill(out: Path):
    started = datetime.now(timezone.utc).isoformat(timespec='seconds')
    manifest = backup(out)
    try:
        status = start_isolated()
        restore(out, status)
        result = verify(out, status)
    finally:
        cleanup()
    result |= {'started': started, 'backup_objects': len(manifest), 'backup_dir': str(out)}
    print(json.dumps(result, indent=1, default=str))
    return result


if __name__ == '__main__':
    command = sys.argv[1] if len(sys.argv) > 1 else 'drill'
    if command == 'cleanup':
        cleanup()
    elif command == 'drill':
        drill(Path(sys.argv[2]) if len(sys.argv) > 2 else Path(tempfile.mkdtemp(prefix='upstream-backup-')))
    else:
        raise SystemExit(__doc__)
