"""Portable command entry point. Uses only this checkout's Python environment."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
PNPM = shutil.which('pnpm.cmd' if os.name == 'nt' else 'pnpm') or 'pnpm'
BIN = lambda root, name: root / 'node_modules/.bin' / (f'{name}.CMD' if os.name == 'nt' else name)  # noqa: E731
SUPABASE, NEXT, TSC = BIN(ROOT, 'supabase'), BIN(ROOT / 'apps/web', 'next'), BIN(ROOT / 'apps/web', 'tsc')


def fill_env():
    """Copy .env.example to .env if missing and fill blank local Supabase keys from `supabase status` (never overwrites)."""
    env = ROOT / '.env'
    if not env.exists():
        shutil.copy(ROOT / '.env.example', env)
    status = subprocess.run([str(SUPABASE), 'status', '-o', 'env'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    values = dict(re.findall(r'^(\w+)="?([^"\n]*)"?$', status, re.M))
    text = env.read_text(encoding='utf-8')
    for name, key in (('SUPABASE_ANON_KEY', 'ANON_KEY'), ('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY')):
        text = re.sub(rf'^{name}=$', f'{name}={values[key]}', text, flags=re.M)
    env.write_text(text, encoding='utf-8')


def run(*args):
    subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)


def main(command):
    if not PYTHON.exists():
        raise SystemExit('Create .venv with Python 3.12+ and install requirements.lock first; see README.')
    if command == 'engine':
        run(PYTHON, '-m', 'pytest', 'tests/engine', '-q', '-p', 'no:cacheprovider')
    elif command == 'e2e':  # needs API :8000 + `next start` :3000 running against the seeded local stack
        run(PYTHON, '-m', 'pytest', 'tests/e2e', '-q', '-p', 'no:cacheprovider')
    elif command == 'test':
        run(PYTHON, '-m', 'pytest', 'tests/api', 'tests/packages', 'tests/security', '-q', '-p', 'no:cacheprovider')
        subprocess.run([str(TSC), '--noEmit'], cwd=ROOT / 'apps/web', check=True)
    elif command == 'security':
        if not (ROOT / 'tests/security').exists():
            raise SystemExit('Security integration suite is not yet implemented; this is not a passing check.')
        run(PYTHON, '-m', 'pytest', 'tests/security', '-q', '-p', 'no:cacheprovider')
    elif command == 'setup':
        if not shutil.which('docker'):
            raise SystemExit('Install and start Docker Desktop or another Docker-compatible engine first.')
        subprocess.run(['docker', 'info'], stdout=subprocess.DEVNULL, timeout=30, check=True)
        run(SUPABASE, 'start')
        run(SUPABASE, 'migration', 'up', '--local')
        fill_env()
        print('Local Supabase started and migrated; local keys written to .env where they were blank.')
    elif command == 'seed':
        run(PYTHON, ROOT / 'scripts/seed_example.py')
    elif command == 'reset':
        # ponytail: reset = rebuild the local database; seed_example.py's guard refuses non-local/production targets.
        run(PYTHON, '-c', 'import sys; sys.path.insert(0, "."); import scripts.seed_example as s; s.guard()')
        run(SUPABASE, 'db', 'reset', '--local')
        run(PYTHON, ROOT / 'scripts/seed_example.py')
    elif command == 'dev':
        api = ROOT / 'services/api/main.py'
        if not api.exists():
            raise SystemExit('API startup is pending implementation. Public web development: pnpm --filter @upstream/web dev')
        processes = [subprocess.Popen([str(PYTHON), '-m', 'uvicorn', 'services.api.main:app', '--port', '8000'], cwd=ROOT),
                     subprocess.Popen([str(PYTHON), '-m', 'services.worker'], cwd=ROOT),
                     subprocess.Popen([str(NEXT), 'dev', '--hostname', '127.0.0.1'], cwd=ROOT / 'apps/web')]
        try:
            for process in processes:
                process.wait()
        finally:
            for process in processes:
                process.terminate()
    elif command == 'fhir':  # installs the checksum-pinned official validator once, then validates a real export bundle
        jar = ROOT / 'exports/fhir/.cache/validator_cli.jar'
        if not jar.exists():
            run(PYTHON, ROOT / 'exports/fhir/validate.py', ROOT / 'exports/fhir/example-bundle.json', '--download')
        run(PYTHON, '-m', 'pytest', 'tests/packages/test_fhir_official.py', 'tests/packages/test_fhir.py', '-q', '-p', 'no:cacheprovider')
    elif command == 'release':
        for stage in ['test', 'engine', 'security', 'fhir']:
            main(stage)
        main('e2e')
        subprocess.run([str(NEXT), 'build'], cwd=ROOT / 'apps/web', check=True)
        if '| FAIL |' in (ROOT / 'docs/release-results.md').read_text():
            raise SystemExit('Release is not complete: unresolved acceptance gates in docs/release-results.md')
    else:
        raise SystemExit('Unknown command')


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise SystemExit(f'Command failed: {exc}')
