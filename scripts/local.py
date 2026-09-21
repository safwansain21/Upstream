"""Portable command entry point. Uses only this checkout's Python environment."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
PNPM = shutil.which('pnpm.cmd' if os.name == 'nt' else 'pnpm') or 'pnpm'


def run(*args):
    subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)


def main(command):
    if not PYTHON.exists():
        raise SystemExit('Create .venv with Python 3.12+ and install requirements.lock first; see README.')
    if command == 'engine':
        run(PYTHON, '-m', 'pytest', 'tests/engine', '-q', '-p', 'no:cacheprovider')
    elif command == 'test':
        run(PYTHON, '-m', 'pytest', 'tests/api', 'tests/packages', '-q', '-p', 'no:cacheprovider')
        run(PNPM, '--filter', '@upstream/web', 'typecheck')
    elif command == 'security':
        if not (ROOT / 'tests/security').exists():
            raise SystemExit('Security integration suite is not yet implemented; this is not a passing check.')
        run(PYTHON, '-m', 'pytest', 'tests/security', '-q', '-p', 'no:cacheprovider')
    elif command == 'setup':
        if not shutil.which('docker'):
            raise SystemExit('Install and start Docker Desktop or another Docker-compatible engine first.')
        subprocess.run(['docker', 'info'], stdout=subprocess.DEVNULL, timeout=30, check=True)
        run(PNPM, 'exec', 'supabase', 'start')
        run(PNPM, 'exec', 'supabase', 'migration', 'up', '--local')
        print('Local Supabase started. Run pnpm exec supabase status to inspect local-only credentials.')
    elif command in {'seed', 'reset'}:
        script = ROOT / 'scripts' / ('seed_example.py' if command == 'seed' else 'reset_example.py')
        if not script.exists():
            raise SystemExit('Example database commands are pending implementation; no records were modified.')
        run(PYTHON, script)
    elif command == 'dev':
        api = ROOT / 'services/api/main.py'
        if not api.exists():
            raise SystemExit('API startup is pending implementation. Public web development: pnpm --filter @upstream/web dev')
        processes = [subprocess.Popen([str(PYTHON), '-m', 'uvicorn', 'services.api.main:app', '--port', '8000'], cwd=ROOT),
                     subprocess.Popen([PNPM, '--filter', '@upstream/web', 'dev'], cwd=ROOT)]
        try:
            for process in processes:
                process.wait()
        finally:
            for process in processes:
                process.terminate()
    elif command == 'fhir':
        script = ROOT / 'exports/fhir/validate.py'
        if not script.exists():
            raise SystemExit('Official FHIR validation runner has not been installed; check is not passing.')
        run(PYTHON, script)
    elif command == 'release':
        for stage in ['test', 'engine', 'security', 'fhir']:
            main(stage)
        run(PNPM, 'test:e2e')
        run(PNPM, 'build')
        if '| FAIL |' in (ROOT / 'docs/release-results.md').read_text():
            raise SystemExit('Release is not complete: unresolved acceptance gates in docs/release-results.md')
    else:
        raise SystemExit('Unknown command')


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise SystemExit(f'Command failed: {exc}')
