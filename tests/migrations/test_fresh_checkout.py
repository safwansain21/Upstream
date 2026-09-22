"""A01: a fresh checkout plus the README commands starts database, auth, storage, API, worker and web, applies migrations and
shows the seeded example. DESTRUCTIVE (replaces the local stack and its data), so it runs only with UPSTREAM_RUN_DESTRUCTIVE=1:

    UPSTREAM_RUN_DESTRUCTIVE=1 .venv/Scripts/python.exe -m pytest tests/migrations -q -p no:cacheprovider -rA

Needs Docker, Node 24 and network access for package installs. Afterwards this checkout's database is reset and reseeded.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
import pytest
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
CLONE = Path(tempfile.gettempdir()) / 'ua01'  # ponytail: short path; Windows fails deep node_modules paths under long folders
WIN = os.name == 'nt'
pytestmark = pytest.mark.skipif(os.getenv('UPSTREAM_RUN_DESTRUCTIVE') != '1', reason='replaces the local stack')


def sh(*args, cwd=CLONE, env=None, timeout=900):
    r = subprocess.run([str(a) for a in args], cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, shell=WIN)
    assert r.returncode == 0, f'{args}: {r.stdout[-2000:]}{r.stderr[-2000:]}'
    return r.stdout


def free_ports():  # the checkout under test must own :3000 and :8000
    if WIN:
        subprocess.run(['powershell', '-Command', "foreach ($p in 3000, 8000) { Get-NetTCPConnection -LocalPort $p -State Listen "
                        "-ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } }; "
                        "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*services.worker*' } "
                        "| ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], capture_output=True)
    else:
        subprocess.run(['fuser', '-k', '3000/tcp', '8000/tcp'], capture_output=True)
        subprocess.run(['pkill', '-f', 'services.worker'], capture_output=True)


def test_fresh_checkout_starts_everything_and_shows_the_example():
    supabase = ROOT / 'node_modules/.bin' / ('supabase.CMD' if WIN else 'supabase')
    free_ports()
    sh(supabase, 'stop', '--no-backup', cwd=ROOT)  # no leftover database volume
    if CLONE.exists():  # git object files are read-only on Windows
        shutil.rmtree(CLONE, onexc=lambda f, p, _: (os.chmod(p, 0o700), f(p)))
    sh('git', 'clone', '--quiet', ROOT, CLONE, cwd=ROOT)  # the committed tree only; nothing local leaks in
    pnpm = ['pnpm'] if shutil.which('pnpm') else ['npx', '-y', 'pnpm@11.19.0']
    venv = CLONE / '.venv' / ('Scripts' if WIN else 'bin')
    env = os.environ | {'PATH': f'{venv}{os.pathsep}{os.environ["PATH"]}'}  # README: run pnpm scripts with the venv active
    dev = None
    try:
        sh(*pnpm, 'install')
        sh(sys.executable, '-m', 'venv', '.venv')
        sh(venv / 'python', '-m', 'pip', 'install', '-q', '-r', 'requirements.lock')
        sh(venv / 'python', '-m', 'playwright', 'install', 'chromium')
        shutil.copy(CLONE / '.env.example', CLONE / '.env')
        sh(*pnpm, 'setup:local', env=env)  # starts Supabase, applies migrations, fills the local keys into .env
        assert re.search(r'^SUPABASE_ANON_KEY=\S+', (CLONE / '.env').read_text(), re.M)
        sh(*pnpm, 'seed:example', env=env)
        dev = subprocess.Popen([*pnpm, 'dev'], cwd=CLONE, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=WIN)
        for _ in range(90):
            try:
                status = httpx.get('http://127.0.0.1:3000/api/v1/status', timeout=5).json()['data']  # through the web proxy
                if status['worker'] == 'available':
                    break
            except (httpx.HTTPError, ValueError, KeyError):
                pass
            time.sleep(2)
        assert status['api'] == 'available' and status['database'] == 'available' and status['worker'] == 'available'
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page()
            page.goto('http://127.0.0.1:3000/example', timeout=120000)  # next dev compiles on first request
            expect(page.locator('a[href="/example/useful-evidence"]')).to_be_visible(timeout=60000)  # seeded examples from the API
            page.goto('http://127.0.0.1:3000/sign-in', timeout=120000)
            page.get_by_label('Email', exact=True).fill('coordinator@example.test')
            page.locator('#password').fill('upstream-example-only')
            page.get_by_role('button', name='Sign in', exact=True).click()
            expect(page.get_by_text('Mill Brook').first).to_be_visible(timeout=120000)  # seeded example case (auth + database)
            browser.close()
    finally:
        if dev:
            subprocess.run(['taskkill', '/T', '/F', '/PID', str(dev.pid)], capture_output=True) if WIN else dev.kill()
        free_ports()
        sh(supabase, 'db', 'reset', '--local', cwd=ROOT)  # hand the stack back to this checkout
        sh(sys.executable, ROOT / 'scripts/seed_example.py', cwd=ROOT)
