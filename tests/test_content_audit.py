"""J11: no unwired button, temporary screen, placeholder copy, fake partner claim or "coming soon" route in the web app."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web/src'
FORBIDDEN = re.compile(r'lorem|ipsum|coming soon|under construction|placeholder page|not implemented|\bTODO\b|\bFIXME\b|\bTBD\b|dummy|'
                       r'partner(ed|ship)?s?\b|trusted by|endorsed by|as seen in|certified by|backed by', re.I)
# PRD section 5 routes (plus /app, which only redirects to the last organization).
REQUIRED = {'/', '/how-it-works', '/example', '/example/[scenario]', '/sign-in', '/auth/callback', '/onboarding', '/app',
            '/app/[org]/investigations', '/app/[org]/investigations/[case]', '/report/new', '/report/[draft]/edit',
            '/app/[org]/reports/[report]', '/app/[org]/tasks', '/app/[org]/tasks/[task]', '/app/[org]/evidence', '/app/[org]/community',
            '/app/[org]/notifications', '/share/[token]', '/privacy', '/accessibility', '/terms', '/status'} | \
           {f'/app/[org]/investigations/[case]/{t}' for t in ('observations', 'tasks', 'map-setup', 'evidence', 'history', 'decision', 'exports')} | \
           {f'/app/[org]/settings/{s}' for s in ('profile', 'organization', 'instruments', 'protocols', 'integrations')}


def sources():
    return [(p, p.read_text(encoding='utf-8')) for p in sorted(WEB.rglob('*.tsx')) + sorted(WEB.rglob('*.ts'))]


def tags(text, name):
    """Opening JSX tags with their attributes (braces balanced), and their offsets."""
    for m in re.finditer(rf'<{name}\b', text):
        i, depth = m.end(), 0
        while i < len(text) and not (text[i] == '>' and depth == 0):
            depth += {'{': 1, '}': -1}.get(text[i], 0)
            i += 1
        yield m.start(), text[m.start():i + 1]


def test_every_route_is_required_scope():
    routes = {'/' + str(p.parent.relative_to(WEB / 'app')).replace('\\', '/') for p in WEB.joinpath('app').rglob('page.tsx')}
    routes = {'/' if r == '/.' else r for r in routes}
    assert routes == REQUIRED, f'extra: {sorted(routes - REQUIRED)}; missing: {sorted(REQUIRED - routes)}'


def test_no_placeholder_copy_or_partner_claims():
    hits = [f'{p.relative_to(ROOT)}:{t[:m.start()].count(chr(10)) + 1}: {m.group(0)}' for p, t in sources()
            for m in FORBIDDEN.finditer(re.sub(r'placeholder="[^"]*"', '', t))]
    assert not hits, hits


def test_every_button_and_form_is_wired():
    unwired = []
    for path, text in sources():
        forms = [(start, tag) for start, tag in tags(text, 'form')]
        for start, tag in forms:
            if 'onSubmit' not in tag and 'action=' not in tag:
                unwired.append(f'{path.relative_to(ROOT)}: form without a handler')
        for start, tag in tags(text, 'button'):
            if 'onClick' in tag or 'type="submit"' in tag and any(s < start for s, _ in forms):
                continue
            enclosing = [s for s, _ in forms if s < start and text.rfind('</form>', s, start) == -1]
            if 'type="button"' in tag or not enclosing:  # a default-submit button must sit inside a form that handles it
                unwired.append(f'{path.relative_to(ROOT)}:{text[:start].count(chr(10)) + 1}: {tag[:80]}')
        for m in re.finditer(r'href="#"|href=\{?["\']javascript:', text):
            unwired.append(f'{path.relative_to(ROOT)}: {m.group(0)}')
    assert not unwired, unwired
