"""Browser checks for B05, B15, G07 (unsafe HTML), I15 and I16."""
import json
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


LOOPING = '''document.getAnimations().filter(a => a.playState === "running" && !isFinite(a.effect.getComputedTiming().endTime))
    .map(a => a.effect.target).filter(t => t && !t.closest(".loading-state"))'''


def test_no_perpetual_decorative_motion_after_settling():  # I15 (dark handoff: subtle scene loops only, stopped by reduced motion)
    pw, browser, p = browser_page()
    try:
        for path in ['/', '/how-it-works', '/example/useful-evidence']:
            p.goto(BASE + path)
            expect(p.locator('#main-content h1').first).to_be_visible()
            p.wait_for_load_state('networkidle')
            p.wait_for_timeout(1200)
            content = p.evaluate(f'({LOOPING}).filter(t => !t.closest(".dusk-scene")).map(t => t.className)')
            assert content == [], (path, content)  # text, buttons and data never loop; only the wind in the scene does
            assert p.evaluate('getComputedStyle(document.body).cursor') in ('auto', 'default')
        p.emulate_media(reduced_motion='reduce')
        for path in ['/', '/how-it-works']:
            p.goto(BASE + path)
            expect(p.locator('#main-content h1').first).to_be_visible()
            p.wait_for_timeout(800)
            assert p.evaluate(f'({LOOPING}).length') == 0, path  # no wind, no drawing, nothing moves
            assert p.locator('[data-motion="water"][data-running="true"]').count() == 0  # the water stops
    finally:
        browser.close(); pw.stop()


def test_home_route_is_actually_drawn():  # I10: visible line, not just a finished CSS animation
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/')
        expect(p.locator('.hero-route .lr-main .lr-line')).to_be_visible()
        p.wait_for_timeout(3800)
        paths = p.locator('.hero-route path.lr-draw').evaluate_all('''paths => paths.map(path => ({
            length: path.hasAttribute('pathLength') ? Number(path.getAttribute('pathLength')) : path.getTotalLength(),
            dash: parseFloat(getComputedStyle(path).strokeDasharray),
            offset: parseFloat(getComputedStyle(path).strokeDashoffset)
        }))''')
        assert paths and all(path['dash'] >= path['length'] and abs(path['offset']) < 0.01 for path in paths), paths
    finally:
        browser.close(); pw.stop()


def test_hero_branch_ends_name_where_water_joins():
    """Each branch end opens its note on hover or keyboard focus, clear of the hero's text and buttons."""
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/')
        p.wait_for_timeout(3800)
        marks = p.locator('.branch-mark')
        assert marks.count() == 3
        assert [m.inner_text().split('\n')[0].strip().lower() for m in marks.all()] == ['field drain', 'road culvert', 'pipe outfall']
        blockers = p.evaluate('''() => [...document.querySelectorAll(".hero-actions .button, .hero-subtitle, .hero-process li")].map(b => b.getBoundingClientRect().toJSON())''')
        for m in marks.all():
            assert 'out' not in m.get_attribute('class').split(), m.get_attribute('class')
            note = m.locator('.branch-note')
            assert float(note.evaluate('n => getComputedStyle(n).opacity')) == 0
            m.hover(); p.wait_for_timeout(500)
            assert float(note.evaluate('n => getComputedStyle(n).opacity')) == 1
            box = note.bounding_box()
            assert not any(box['x'] < b['right'] and box['x'] + box['width'] > b['left'] and box['y'] < b['bottom'] and box['y'] + box['height'] > b['top'] for b in blockers), box
        p.mouse.move(5, 5); p.locator('body').focus()
        marks.nth(1).focus(); p.wait_for_timeout(500)
        assert float(marks.nth(1).locator('.branch-note').evaluate('n => getComputedStyle(n).opacity')) == 1
    finally:
        browser.close(); pw.stop()


def test_example_cards_are_distinct_places_that_settle_in():
    """Each example card is its own photograph with no network drawn on it; it settles in fully once on screen."""
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/example')
        arts = p.locator('.example-art')
        expect(arts.first).to_be_visible()
        assert p.locator('.example-art svg path').count() == 0
        scenes = arts.evaluate_all('arts => arts.map(a => a.dataset.scene)')
        assert len(scenes) >= 4 and len(set(scenes)) == len(scenes), scenes
        arts.first.scroll_into_view_if_needed()
        p.wait_for_timeout(2800)
        first = arts.first
        assert first.get_attribute('data-live') == 'true' and first.get_attribute('data-seen') is not None
        assert float(first.locator('.example-art-box').evaluate('b => getComputedStyle(b).opacity')) == 1
    finally:
        browser.close(); pw.stop()


def test_water_stops_scheduling_frames_when_scene_leaves_view():
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/')
        expect(p.locator('[data-motion="water"][data-running="true"]')).to_have_count(1)
        p.evaluate('''() => {
            window.__waterFrames = 0;
            const original = window.requestAnimationFrame;
            window.requestAnimationFrame = callback => {
                if (String(callback).includes('drawArrays')) window.__waterFrames++;
                return original(callback);
            };
        }''')
        p.locator('.site-footer').scroll_into_view_if_needed()
        expect(p.locator('[data-motion="water"][data-running="false"]')).to_have_count(1)
        p.evaluate('window.__waterFrames = 0')
        p.wait_for_timeout(300)
        count = p.evaluate('window.__waterFrames')
        assert count == 0, count
    finally:
        browser.close(); pw.stop()


def test_foliage_sway_pauses_with_the_water_offscreen():
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/')
        sway = '''() => document.querySelector(".dusk-scene").getAnimations({subtree: true})
            .filter(a => a.effect.target.closest(".scene-foliage")).map(a => a.playState)'''
        expect(p.locator('.dusk-scene:not([data-paused])')).to_have_count(1)
        assert set(p.evaluate(sway)) == {'running'}
        p.locator('.site-footer').scroll_into_view_if_needed()
        expect(p.locator('.dusk-scene[data-paused]')).to_have_count(1)
        assert set(p.evaluate(sway)) == {'paused'}
        p.evaluate('window.scrollTo(0, 0)')
        expect(p.locator('.dusk-scene:not([data-paused])')).to_have_count(1)
        assert set(p.evaluate(sway)) == {'running'}
    finally:
        browser.close(); pw.stop()


def test_workspace_navigation_keeps_no_scene_or_webgl_behind():  # one still band, no leak across client navigations
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/sign-in')
        sign_in(p, 'coordinator@example.test')
        expect(p).to_have_url(re.compile('/investigations'))
        cdp = p.context.new_cdp_session(p); cdp.send('Performance.enable')

        def nodes():
            p.wait_for_timeout(800); cdp.send('HeapProfiler.collectGarbage'); cdp.send('HeapProfiler.collectGarbage')
            return next(m['value'] for m in cdp.send('Performance.getMetrics')['metrics'] if m['name'] == 'Nodes')
        home, other = f'/app/{ORG}/tasks', f'/app/{ORG}/notifications'
        p.goto(BASE + home); p.wait_for_load_state('networkidle')
        counts = []
        for _ in range(4):
            for path in (other, home):
                p.evaluate('path => window.next.router.push(path)', path)
                p.wait_for_url('**' + path); p.wait_for_load_state('networkidle')
            counts.append(nodes())
        assert counts[-1] - counts[0] < 60, counts  # each navigation used to strand a full detached scene (~100 nodes)
        assert p.locator('.dusk-band').count() == 1 and p.locator('canvas').count() == 0  # the band is a still plate
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
        expect(p.get_by_text('Synthetic example').first).to_be_visible()
        p.goto(BASE + '/sign-in')
        sign_in(p, 'expert@example.test')
        expect(p).to_have_url(re.compile('/investigations'))
        mill = case_id('Mill Brook')
        p.goto(f'{BASE}/app/{ORG}/investigations/{mill}')
        expect(p.locator('section', has=p.get_by_role('heading', name='Local network')).get_by_text('Synthetic example')).to_be_visible()
        p.goto(f'{BASE}/app/{ORG}/investigations/{mill}/observations')
        expect(p.get_by_role('region', name='Readings').get_by_text('Synthetic example').first).to_be_visible()
        q = browser.new_context().new_page()
        q.goto(BASE + '/sign-in')
        sign_in(q, 'contributor@example.test')
        expect(q).to_have_url(re.compile('/investigations'))
        q.goto(f'{BASE}/app/{ORG}/community')
        expect(q.get_by_role('heading', name='Your contributions')).to_be_visible()
        report_id = client.get(f'/api/v1/orgs/{ORG}/cases/{mill}', headers=as_('coordinator')).json()['data']['reports'][0]['id']
        q.goto(f'{BASE}/app/{ORG}/reports/{report_id}')
        expect(q.get_by_text('Synthetic example').first).to_be_visible()
    finally:
        browser.close(); pw.stop()


def test_ai_cross_check_prompts_before_sending_and_links_the_run(tmp_path):  # Track 3: validation check, human in the loop
    from PIL import Image
    photo = tmp_path / 'weir.jpg'
    Image.new('RGB', (320, 240), (110, 80, 45)).save(photo)
    pw, browser, p = browser_page()
    sent = {}
    try:
        p.goto(BASE + '/sign-in')
        sign_in(p, fresh_contributor())
        expect(p).to_have_url(re.compile('/investigations|/onboarding'))

        def fake(route):  # the provider's answer is fixed; the API's own check is tests/api/test_ai.py
            sent['describe'] = json.loads(route.request.post_data)
            media = sent['describe']['media_ids'][0]
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'data': {'run_id': '01995d20-0000-7000-8000-00000000a1a1',
                'suggestion': {'observation_candidates': [{'code': 'foam_visible', 'description': 'White foam at the weir', 'input_reference': 'text'},
                                                          {'code': 'image_quality_issue', 'description': 'Blurred photo', 'input_reference': media}],
                               'suggested_questions': [], 'abstained': False},
                'checks': [{'kind': 'not_in_photos', 'code': 'foam_visible'}, {'kind': 'photo_quality', 'photo': 1}]}}))
        p.route(re.compile(r'.*/api/v1/orgs/[^/]+/ai/describe$'), fake)
        p.on('request', lambda r: sent.__setitem__('report', json.loads(r.post_data)) if r.method == 'POST' and re.search(r'/orgs/[^/]+/reports$', r.url) else None)
        p.goto(BASE + '/report/new')
        p.get_by_label('Describe your observation').fill('White foam building up against the weir')
        p.get_by_label('Photos (optional, up to 5)').set_input_files(str(photo))
        p.get_by_text(re.compile('Optional: suggest wording and check your photos')).click()
        p.get_by_label(re.compile('Send my photos')).check()
        p.get_by_role('button', name='Suggest wording').click()
        expect(p.get_by_text('Worth a second look')).to_be_visible()
        assert sent['describe']['consent_photos'] and len(sent['describe']['media_ids']) == 1  # uploaded (EXIF removed) before the AI saw it
        expect(p.get_by_text(re.compile('Your text mentions foam, but the photos you sent'))).to_be_visible()
        expect(p.get_by_text(re.compile('Photo 1 may be too dark, blurred or distant'))).to_be_visible()
        expect(p.get_by_text('Blurred photo')).to_have_count(0)  # a quality finding is a check, never wording to add
        expect(p.get_by_label('Describe your observation')).to_have_value('White foam building up against the weir')  # nothing changed
        p.get_by_role('button', name='Continue to location').click()
        p.get_by_label('Landmark or directions').fill('Weir by the mill')
        p.get_by_role('button', name='Continue to review').click()
        p.get_by_role('button', name='Submit report').click()
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+'))
        assert sent['report']['ai_run_id'] == '01995d20-0000-7000-8000-00000000a1a1'
        assert sent['report']['media_ids'] == sent['describe']['media_ids']  # the same upload, not a second copy
    finally:
        browser.close(); pw.stop()


def test_ai_unavailable_is_labelled_and_manual_reporting_continues():  # H08 B10 (browser)
    pw, browser, p = browser_page()
    try:
        p.goto(BASE + '/sign-in')
        sign_in(p, fresh_contributor())
        expect(p).to_have_url(re.compile('/investigations|/onboarding'))
        # the provider fails whatever the local .env configures; the API's own no-provider path is tests/api/test_ai.py
        p.route(re.compile(r'.*/api/v1/orgs/[^/]+/ai/describe$'), lambda route: route.fulfill(status=503, content_type='application/json',
                body='{"error":{"code":"PROVIDER_UNAVAILABLE","message":"AI assistance is unavailable; you can continue manually.","retryable":true,"request_id":"x"}}'))
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
