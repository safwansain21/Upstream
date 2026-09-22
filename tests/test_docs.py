"""J10: the operations documentation classifies every environment variable and covers the required procedures."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_runbook_classifies_every_env_var_and_covers_procedures():
    runbook = (ROOT / 'docs/runbook.md').read_text(encoding='utf-8')
    variables = set(re.findall(r'^([A-Z][A-Z0-9_]+)=', (ROOT / '.env.example').read_text(encoding='utf-8'), re.M))
    missing = sorted(v for v in variables if v not in runbook)
    assert not missing, f'undocumented environment variables: {missing}'
    for heading in ('## Environment variables', '## First production setup', '## Signing keys and rotation', '## Backups and restore',
                    '## Rollback', '## Queues and solver limits', '## Secrets hygiene'):
        assert heading in runbook, heading
    assert 'bootstrap_org.py' in runbook and 'secret_scan.py' in runbook


def test_readme_lists_the_documented_local_commands():
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    for command in ('pnpm install', 'supabase start', 'migration up', 'pnpm seed:example', 'pnpm dev', 'pytest tests'):
        assert command in readme, command
