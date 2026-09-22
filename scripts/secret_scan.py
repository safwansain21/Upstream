"""Fail if privileged secrets appear in the browser build or in tracked files (A05). Exit 1 with findings.

Checks: actual configured secret values (service-role key, signing key, database password) and generic
patterns (private key blocks, Supabase secret keys, service_role JWTs) in apps/web/.next and git-tracked files.
"""
import base64
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from services.api.config import settings  # noqa: E402

PATTERNS = {'PRIVATE KEY block': re.compile(rb'-----BEGIN (?:EC |RSA |OPENSSH |)PRIVATE KEY-----'), 'Supabase secret key': re.compile(rb'sb_secret_[A-Za-z0-9_-]{10,}')}


def jwt_role(token: bytes) -> str | None:
    try:
        payload = token.split(b'.')[1]
        return json.loads(base64.urlsafe_b64decode(payload + b'=' * (-len(payload) % 4))).get('role')
    except Exception:  # noqa: BLE001
        return None


def scan(files, secrets):
    findings = []
    for path in files:
        try:
            data = path.read_bytes()
        except OSError:
            continue
        for s in secrets:
            if s and s in data:
                findings.append(f'{path.relative_to(ROOT)}: configured secret value')
        for name, pattern in PATTERNS.items():
            if pattern.search(data):
                findings.append(f'{path.relative_to(ROOT)}: {name}')
        for token in re.findall(rb'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}', data):
            if jwt_role(token) == 'service_role':
                findings.append(f'{path.relative_to(ROOT)}: service_role JWT')
    return sorted(set(findings))


def main():
    cfg = settings()
    password = re.search(r'://[^:]+:([^@]+)@', cfg.database_url)
    secrets = [v.encode() for v in (cfg.supabase_service_role_key, cfg.export_signing_private_key, password and password.group(1) != 'postgres' and password.group(1)) if v]
    build = ROOT / 'apps/web/.next'
    if not (build / 'static').exists():
        print('No production build found; run pnpm build first.', file=sys.stderr)
        return 1
    browser_files = [p for p in (build / 'static').rglob('*') if p.is_file()] + [p for p in (build / 'server/app').rglob('*.html') if p.is_file()]
    tracked = [ROOT / p for p in subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.splitlines()]
    findings = scan(browser_files, secrets) + scan([p for p in tracked if p.suffix not in {'.png', '.jpg', '.pdf', '.lock'} and p.name != 'pnpm-lock.yaml'], secrets)
    for f in findings:
        print('SECRET:', f)
    print(f'Scanned {len(browser_files)} browser build files and {len(tracked)} tracked files: {len(findings)} finding(s).')
    return 1 if findings else 0


if __name__ == '__main__':
    raise SystemExit(main())
