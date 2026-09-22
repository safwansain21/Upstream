"""A05: browser build and tracked files contain no privileged keys; the scanner itself detects planted secrets."""
import os
import shutil
import subprocess
import sys
from pathlib import Path

from scripts.secret_scan import scan
from services.api.config import settings

ROOT = Path(__file__).resolve().parents[2]


def test_scanner_detects_planted_service_key_and_private_key(tmp_path):
    planted = tmp_path / 'chunk.js'
    import base64
    b64 = lambda d: base64.urlsafe_b64encode(d.encode()).decode().rstrip('=')  # noqa: E731  built at runtime so this file stays clean
    service_jwt = '.'.join([b64('{"alg":"HS256","typ":"JWT"}'), b64('{"iss":"supabase","role":"service_role"}'), b64('signature-signature')])
    planted.write_text(f'const k="{service_jwt}";\n' + '-----BEGIN ' + 'PRIVATE KEY-----\nabc')
    import scripts.secret_scan as s
    old = s.ROOT
    s.ROOT = tmp_path
    try:
        findings = scan([planted], [b'super-secret-value'])
    finally:
        s.ROOT = old
    assert any('service_role JWT' in f for f in findings) and any('PRIVATE KEY' in f for f in findings)


def test_production_build_and_repository_have_no_privileged_secrets():
    assert settings().supabase_service_role_key, 'configure the local service key so its absence from the bundle is meaningful'
    result = subprocess.run([sys.executable, str(ROOT / 'scripts/secret_scan.py')], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


def test_web_typecheck_passes():
    npx = shutil.which('npx.cmd' if os.name == 'nt' else 'npx')
    result = subprocess.run([npx, 'tsc', '--noEmit'], cwd=ROOT / 'apps/web', capture_output=True, text=True, timeout=600)
    assert result.returncode == 0, result.stdout[-2000:]
