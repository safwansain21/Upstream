"""Every required route renders a real state, internal links resolve (A07, J11), and axe finds no serious/critical issues (I08)."""
import glob
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect

from tests.api.test_analysis import case_id
from tests.api.test_http import ORG
from tests.e2e.test_report_flow import BASE, page  # noqa: F401
from tests.e2e.test_task_flow import open_as

ROOT = Path(__file__).resolve().parents[2]
AXE = next(iter(glob.glob(str(ROOT / 'node_modules/.pnpm/axe-core@*/node_modules/axe-core/axe.min.js'))))
PUBLIC = ['/', '/how-it-works', '/example', '/example/useful-evidence', '/example/unmapped', '/example/tidal', '/sign-in', '/privacy', '/accessibility', '/terms', '/status']
CASE_TABS = ['', '/observations', '/tasks', '/map-setup', '/evidence', '/history', '/decision', '/exports']
WORKSPACE = ['/investigations', '/tasks', '/evidence', '/community', '/notifications', '/settings/profile', '/settings/organization',
             '/settings/instruments', '/settings/protocols', '/settings/integrations']


def rendered(p, path):
    p.goto(BASE + path)
    expect(p.locator('#main-content h1').first).to_be_visible(timeout=15000)
    expect(p.get_by_text('This page could not load')).to_have_count(0)
    return {h for h in p.eval_on_selector_all('a[href^="/"]', 'els => els.map(e => e.getAttribute("href"))') if not h.startswith('/api/')}


def axe(p):
    p.evaluate('document.getAnimations().filter(a => a.effect && isFinite(a.effect.getComputedTiming().endTime)).forEach(a => a.finish())')  # scan the settled state (entrance motion is <700 ms)
    p.add_script_tag(path=AXE)
    result = p.evaluate('async () => (await axe.run(document, {resultTypes: ["violations"]})).violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, target: v.nodes[0].target.join(" ")}))')
    return [v for v in result if v['impact'] in ('serious', 'critical')]


def test_public_routes_and_links_resolve(page):  # A07 J11
    links = set()
    for path in PUBLIC:
        links |= rendered(page, path)
    dead = [h for h in sorted(links) if page.request.get(BASE + h.split('#')[0]).status == 404]
    assert not dead, dead


@pytest.mark.parametrize('role', ['expert', 'coordinator'])
def test_workspace_and_case_routes_render(page, role):  # A03 A07 J11
    open_as(page, f'{role}@example.test')
    mill = case_id('Mill Brook')
    links = set()
    for path in [f'/app/{ORG}{w}' for w in WORKSPACE] + [f'/app/{ORG}/investigations/{mill}{t}' for t in CASE_TABS]:
        links |= rendered(page, path)
        page.reload()  # direct load/refresh keeps org and case identity
        expect(page.locator('#main-content h1').first).to_be_visible(timeout=15000)
    dead = [h for h in sorted(links) if not re.search(r'/report/new|/share/', h) and page.request.get(BASE + h.split('#')[0]).status == 404]
    assert not dead, dead


def test_no_serious_accessibility_violations(page):  # I08 (automated part)
    findings = {}
    for path in ['/', '/how-it-works', '/example', '/example/useful-evidence', '/sign-in', '/status']:
        rendered(page, path)
        if path == '/status':  # scan after the live check settles; mid-scan the button flips from disabled to enabled
            expect(page.locator('section[aria-busy="false"]')).to_be_visible(timeout=15000)
        if v := axe(page):
            findings[path] = v
    open_as(page, 'expert@example.test')
    mill = case_id('Mill Brook')
    for path in [f'/app/{ORG}/investigations', f'/app/{ORG}/investigations/{mill}', f'/app/{ORG}/investigations/{mill}/evidence',
                 f'/app/{ORG}/tasks', f'/app/{ORG}/settings/profile', '/report/new']:
        page.goto(BASE + path)
        expect(page.locator('#main-content h1').first).to_be_visible(timeout=15000)
        page.wait_for_load_state('networkidle')
        if v := axe(page):
            findings[path] = v
    assert not findings, findings
