"""Browser checks for B05, B15, G07 (unsafe HTML), I15 and I16."""
import re
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright

from tests.api.test_analysis import case_id
from tests.api.test_http import ORG, as_, client, fresh_contributor, report
from tests.e2e.test_report_flow import BASE, sign_in


def browser_page(**context):
    pw = sync_playwright().start()
    browser = pw.chromium.launch()
    return pw, browser, browser.new_context(viewport={'width': 1280, 'height': 900}, **context).new_page()


def test_geolocation_denied_still_allows_landmark_report_without_land_assertion():  # B05 B15
    pw, browser, p = browser_page(permissions=[])  # geolocation not granted
    try:
        p.goto(BASE + '/sign-in')
        sign_in(p, fresh_contributor())
        expect(p).to_have_url(re.compile('/investigations|/onboarding'))
        p.goto(BASE + '/report/new')
        p.get_by_label('Dead wildlife').check()
        p.get_by_role('button', name='Continue to location').click()
        expect(p.get_by_text('Use public or approved access points')).to_be_visible()  # guidance, not a gate
        assert p.get_by_role('checkbox', name=re.compile('permitted|private land', re.I)).count() == 0
        p.get_by_role('button', name='Use my current location').click()
        expect(p.get_by_text(re.compile('Location permission was not granted|Location is not available'))).to_be_visible()
        p.get_by_label('Landmark or directions').fill('Culvert under the ring road')
        p.get_by_role('button', name='Continue to review').click()
        p.get_by_role('button', name='Submit report').click()
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+'))
        expect(p.get_by_text('Location to be confirmed')).to_be_visible()
    finally:
        browser.close(); pw.stop()


def test_report_html_is_rendered_as_text_not_executed():  # G07 (unsafe HTML)
    payload = f'<img src=x onerror="document.title=\'pwned\'"><script>document.title="pwned"</script> {uuid4().hex[:6]}'
    r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(description=payload), headers=as_('reporter') | {'Idempotency-Key': str(uuid4())}).json()['data']
    pw, browser, p = browser_page()
    dialogs = []
    p.on('dialog', lambda d: (dialogs.append(d.message), d.dismiss()))
    try:
        p.goto(BASE + '/sign-in')
        sign_in(p, 'coordinator@example.test')
        expect(p).to_have_url(re.compile('/investigations'))
        p.goto(f"{BASE}/app/{ORG}/investigations/{r['case_id']}")
        expect(p.get_by_text(re.compile(r'<img src=x onerror='))).to_be_visible()  # shown literally
        assert p.locator('#main-content img[src="x"]').count() == 0 and p.title() != 'pwned' and not dialogs
    finally:
        browser.close(); pw.stop()


def test_no_perpetual_decorative_motion_after_settling():  # I15
    pw, browser, p = browser_page()
    try:
        for path in ['/', '/how-it-works', '/example/useful-evidence']:
            p.goto(BASE + path)
            expect(p.locator('#main-content h1').first).to_be_visible()
            p.wait_for_load_state('networkidle')
            p.wait_for_timeout(1200)
            looping = p.evaluate('''document.getAnimations().filter(a => a.playState === "running" && !isFinite(a.effect.getComputedTiming().endTime))
                .map(a => a.effect.target && a.effect.target.className).filter(c => !String(c).includes("loading"))''')
            assert looping == [], (path, looping)
            assert p.evaluate('getComputedStyle(document.body).cursor') in ('auto', 'default')
    finally:
        browser.close(); pw.stop()


def test_back_and_forward_keep_case_identity():  # I16
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/sign-in')
        sign_in(p, 'expert@example.test')
        expect(p).to_have_url(re.compile('/investigations'))
        mill = case_id('Mill Brook')
        p.goto(f'{BASE}/app/{ORG}/investigations/{mill}')
        expect(p.get_by_role('heading', level=1, name='Mill Brook')).to_be_visible()
        p.get_by_role('link', name='History', exact=True).click()
        expect(p.get_by_role('heading', name='Case history')).to_be_visible()
        p.go_back()
        expect(p.get_by_role('heading', level=1, name='Mill Brook')).to_be_visible()
        assert mill in p.url
        p.go_forward()
        expect(p.get_by_role('heading', name='Case history')).to_be_visible()
        assert mill in p.url and p.title().startswith('Case history')
    finally:
        browser.close(); pw.stop()


def test_origin_is_labelled_on_maps_observations_receipts_and_examples():  # J04 (exports: test_export_contains_matching_versions_and_verifies)
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/example/useful-evidence')
        expect(p.get_by_text('Example data').first).to_be_visible()
        p.goto(BASE + '/sign-in')
        sign_in(p, 'expert@example.test')
        expect(p).to_have_url(re.compile('/investigations'))
        mill = case_id('Mill Brook')
        p.goto(f'{BASE}/app/{ORG}/investigations/{mill}')
        expect(p.locator('section', has=p.get_by_role('heading', name='Local network')).get_by_text('Example data')).to_be_visible()
        p.goto(f'{BASE}/app/{ORG}/investigations/{mill}/observations')
        expect(p.get_by_role('region', name='Readings').get_by_text('Example data').first).to_be_visible()
        q = browser.new_context().new_page()
        q.goto(BASE + '/sign-in')
        sign_in(q, 'contributor@example.test')
        expect(q).to_have_url(re.compile('/investigations'))
        q.goto(f'{BASE}/app/{ORG}/community')
        expect(q.get_by_role('heading', name='Your contributions')).to_be_visible()
        report_id = client.get(f'/api/v1/orgs/{ORG}/cases/{mill}', headers=as_('coordinator')).json()['data']['reports'][0]['id']
        q.goto(f'{BASE}/app/{ORG}/reports/{report_id}')
        expect(q.get_by_text('Example data').first).to_be_visible()
    finally:
        browser.close(); pw.stop()


def test_ai_unavailable_is_labelled_and_manual_reporting_continues():  # H08 B10 (browser)
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/sign-in')
        sign_in(p, fresh_contributor())
        expect(p).to_have_url(re.compile('/investigations|/onboarding'))
        p.goto(BASE + '/report/new')
        p.get_by_label('Describe your observation').fill('White foam building up against the weir')
        p.get_by_text(re.compile('Optional: suggest wording')).click()
        p.get_by_role('button', name='Suggest wording').click()
        expect(p.get_by_text('AI assistance is unavailable; you can continue manually.')).to_be_visible()
        expect(p.get_by_label('Describe your observation')).to_have_value('White foam building up against the weir')  # nothing changed
        p.get_by_role('button', name='Continue to location').click()
        p.get_by_label('Landmark or directions').fill('Weir by the mill')
        p.get_by_role('button', name='Continue to review').click()
        p.get_by_role('button', name='Submit report').click()
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+'))
    finally:
        browser.close(); pw.stop()
