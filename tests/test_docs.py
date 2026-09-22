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


def test_handoff_report_matches_release_results_and_claims_no_field_validation():  # J12
    handoff = (ROOT / 'docs/handoff.md').read_text(encoding='utf-8')
    failing = re.findall(r'^\| ([A-J]\d\d) \| FAIL \|', (ROOT / 'docs/release-results.md').read_text(encoding='utf-8'), re.M)
    listed = handoff.split('## Gates not passing')[1].split('\n## ')[0]
    assert sorted(set(re.findall(r'\b[A-J]\d\d\b', listed))) == sorted(failing)  # every open gate, and only those
    named = set(re.findall(r'`(tests/[\w/]+\.py)`', handoff))
    actual = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'tests').rglob('test_*.py')}
    assert named == actual, (sorted(actual - named), sorted(named - actual))  # the report lists the tests that exist
    for heading in ('## Final run', '## Integrations not available or not verified', '## Empirical limits'):
        assert heading in handoff
    assert 'has not been validated in the field' in handoff
    assert not re.search(r'field[- ]validated|clinically|proven (safe|accurate)', handoff, re.I)
