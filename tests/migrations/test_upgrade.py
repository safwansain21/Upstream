"""A08: fresh migrations and upgrade from an earlier schema with data. DESTRUCTIVE to the local database, so it runs only
with UPSTREAM_RUN_DESTRUCTIVE=1 and reseeds the example workspace afterwards:

    UPSTREAM_RUN_DESTRUCTIVE=1 .venv/Scripts/python.exe -m pytest tests/migrations -q -p no:cacheprovider -rA
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[2]
DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
SUPABASE = str(ROOT / 'node_modules/.bin/' / ('supabase.CMD' if os.name == 'nt' else 'supabase'))
pytestmark = pytest.mark.skipif(os.getenv('UPSTREAM_RUN_DESTRUCTIVE') != '1', reason='resets the local database')


def cli(*args):
    r = subprocess.run([SUPABASE, *args], cwd=ROOT, capture_output=True, text=True, timeout=600)
    assert r.returncode == 0, r.stdout[-2000:] + r.stderr[-2000:]


def versions():
    return sorted(p.name.split('_')[0] for p in (ROOT / 'supabase/migrations').glob('*.sql'))


def test_upgrade_from_earlier_schema_preserves_data_then_fresh_reset_works():
    earlier = versions()[4]  # a schema from before networks, review, delivery and receipts existed
    try:
        cli('db', 'reset', '--local', '--version', earlier)
        org, case = uuid4(), uuid4()
        with psycopg.connect(DB, autocommit=True) as db:
            applied = [r[0] for r in db.execute('select version from supabase_migrations.schema_migrations order by version')]
            assert applied[-1] == earlier
            db.execute("insert into organizations(id,name,slug) values(%s,'Upgrade fixture',%s)", (org, f'upgrade-{org.hex[:6]}'))
            db.execute("insert into cases(id,org_id,title) values(%s,%s,'Upgrade fixture case')", (case, org))
        cli('migration', 'up', '--local')
        with psycopg.connect(DB, autocommit=True) as db:
            applied = [r[0] for r in db.execute('select version from supabase_migrations.schema_migrations order by version')]
            assert applied == versions()
            assert db.execute('select title,merged_into,review_hold from cases where id=%s', (case,)).fetchone() == ('Upgrade fixture case', None, False)
            assert db.execute("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity").fetchone()[0] == 0
    finally:
        cli('db', 'reset', '--local')  # fresh path: every migration from zero
        subprocess.run([sys.executable, str(ROOT / 'scripts/seed_example.py')], cwd=ROOT, check=True, timeout=600)
    with psycopg.connect(DB) as db:
        assert db.execute("select count(*) from cases where title='Mill Brook'").fetchone()[0] == 1
