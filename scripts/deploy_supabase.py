"""Prepare the hosted Supabase project for the free demo (docs/hosting.md): apply every migration, then seed the
synthetic example workspace. Reads .env.hosted (never committed). Safe to rerun: migrations and the seed are idempotent.

Run: .venv/Scripts/python.exe scripts/deploy_supabase.py
"""
import os
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
SUPABASE = str(ROOT / 'node_modules/.bin' / ('supabase.CMD' if os.name == 'nt' else 'supabase'))

env = {k: v for k, v in dotenv_values(ROOT / '.env.hosted').items() if v}
missing = [k for k in ('DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY') if k not in env]
if missing:
    sys.exit(f'Fill these in .env.hosted first: {", ".join(missing)}')
subprocess.run([SUPABASE, 'db', 'push', '--db-url', env['DATABASE_URL'], '--include-all', '--yes'], cwd=ROOT, check=True)
subprocess.run([sys.executable, 'scripts/seed_example.py'], cwd=ROOT, check=True,
               env=os.environ | env | {'UPSTREAM_SEED_HOSTED_DEMO': '1'})
print('Hosted database is migrated and seeded.')
