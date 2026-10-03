"""Visual, interaction and accessibility gates for the dark UI (I02-I10, I12-I14, I17), in Chromium against `next start`.
I02 and I15 are evaluated per the 2026-09-26 amendment in docs/specification/ACCEPTANCE.md (dark handoff palette)."""
import json
import re
import time
from contextlib import contextmanager

from playwright.sync_api import expect, sync_playwright

from scripts.seed_example import sid
from tests.api.test_analysis import case_id
from tests.api.test_exports import approved_case, export, recipient
from tests.api.test_field_work import assign, new_task
from tests.api.test_http import ORG, as_, client
from tests.api.test_review import compute, readings, scenario
from tests.e2e.test_report_flow import BASE, sign_in
from tests.e2e.test_routes import AXE, CASE_TABS, PUBLIC, WORKSPACE

WIDTHS = [1920, 1440, 1280, 1024, 768, 390, 320]
NIGHT, IVORY, AMBER = '#071113', '#f4f0e8', '#eeaf63'


@contextmanager
def browser(**context):
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        try:
            yield b.new_context(viewport={'width': 1440, 'height': 900}, **context).new_page()
        finally:
            b.close()


def signed_in(p, role='expert'):
    p.goto(BASE + '/sign-in')
    sign_in(p, f'{role}@example.test')
    expect(p).to_have_url(re.compile('/investigations'))


def share_path():
    case, a = approved_case()
    export(a['id'])
    package = client.get(f'/api/v1/orgs/{ORG}/cases/{case}/packages', headers=as_('expert')).json()['data'][0]['id']
    r = client.post(f'/api/v1/orgs/{ORG}/packages/{package}/deliveries', json={'recipient_id': recipient()}, headers=as_('expert'))
    assert r.status_code in (200, 201), r.text
    return r.json()['data']['share_path']


def app_pages():
    mill = case_id('Mill Brook')
    return [f'/app/{ORG}{w}' for w in WORKSPACE] + [f'/app/{ORG}/investigations/{mill}{t}' for t in CASE_TABS]


def settle(p, path):
    p.goto(BASE + path)
    expect(p.locator('#main-content h1').first).to_be_visible(timeout=20000)
    expect(p.locator('#main-content[aria-busy]')).to_have_count(0, timeout=20000)
    p.wait_for_load_state('networkidle')
    p.wait_for_timeout(600)


def every_page(p, check, share):
    """Run `check(path)` on every required page: public, report, share, then onboarding and every workspace and case route as an expert.
    `share` comes from share_path(), created before any browser opens (package export renders its PDF with Playwright)."""
    found = {}
    for path in PUBLIC + ['/report/new', share]:
        settle(p, path)
        if (r := check(path)):
            found[path] = r
    signed_in(p)
    for path in ['/onboarding'] + app_pages():  # onboarding needs a session
        settle(p, path)
        if (r := check(path)):
            found[path] = r
    return found


def tab_to(p, locator, limit=120):
    for _ in range(limit):
        p.keyboard.press('Tab')
        if locator.evaluate('el => el === document.activeElement'):
            return
    raise AssertionError(f'could not reach {locator} by keyboard')


def test_dark_palette_and_type_on_every_page():  # I02 (per the amendment)
    share = share_path()
    with browser() as p:
        def check(path):
            s = p.evaluate('''() => { const root = getComputedStyle(document.documentElement), h1 = document.querySelector("#main-content h1");
                const body = getComputedStyle(document.body);
                const fonts = new Set([...document.querySelectorAll("body *")].map(e => getComputedStyle(e).fontFamily.split(",")[0].replace(/"/g, "").trim()));
                return { night: root.getPropertyValue("--night").trim(), ivory: root.getPropertyValue("--mist").trim(), amber: root.getPropertyValue("--amber").trim(),
                  display: getComputedStyle(h1).fontFamily, body: body.fontFamily, stretch: body.fontStretch, fonts: [...fonts] }; }''')
            problems = []
            if (s['night'], s['ivory'], s['amber']) != (NIGHT, IVORY, AMBER):
                problems.append(f"tokens {s['night']} {s['ivory']} {s['amber']}")
            if not s['display'].startswith('Newsreader'):
                problems.append('display ' + s['display'])
            if not s['body'].startswith('"Source Sans 3"') or s['stretch'] != '100%':
                problems.append('body ' + s['body'] + ' ' + s['stretch'])
            if any('Barlow' in f for f in s['fonts']):
                problems.append('condensed display font in use')
            return problems
        assert not every_page(p, check, share)


def test_scene_art_is_decoration_never_a_flattened_screenshot():  # I03
    share = share_path()
    with browser() as p:
        requested = []
        p.on('request', lambda r: requested.append(r.url))

        def check(path):  # scene, notebook and example art: alt-less, aria-hidden and never in the way of a click
            return p.evaluate('''() => [...document.querySelectorAll(".dusk-scene img, .field-notebook img, .example-art img")].filter(i => {
                const art = i.closest(".dusk-scene, .field-notebook, .example-art");
                return i.alt !== "" || !i.closest("[aria-hidden=true]") || (!i.closest(".example-art") && getComputedStyle(art).pointerEvents !== "none"); }).map(i => i.currentSrc)''')
        found = every_page(p, check, share)
        assert not found, found
        assert not [u for u in requested if re.search(r'/references/|gallery|dark-[a-z-]+\.png', u)]


def test_decoration_never_covers_focus_or_map_controls():  # I04
    with browser() as p:
        def covered():
            return p.evaluate('''() => { const a = document.activeElement; if (!a || a === document.body) return null;
                const r = a.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null;
                const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
                const top = document.elementFromPoint(x, y);
                if (!top || top === a || a.contains(top) || top.contains(a) || (top.closest("label") && top.closest("label").contains(a))) return null;
                return `${a.tagName}.${a.className} under ${top.tagName}.${top.className}`; }''')
        problems = []
        mill = case_id('Mill Brook')
        for path, role in [('/', None), ('/how-it-works', None), ('/report/new', None), (f'/app/{ORG}/investigations', 'expert'),
                           (f'/app/{ORG}/investigations/{mill}', 'expert'), (f'/app/{ORG}/investigations/{mill}/map-setup', 'expert')]:
            if role and not p.url.startswith(BASE + '/app'):
                signed_in(p, role)
            settle(p, path)
            p.wait_for_timeout(1800)  # entrance motion settled
            p.locator('body').focus()
            for _ in range(45):
                p.keyboard.press('Tab')
                last = None  # measure where the person sees it: once smooth focus scrolling and the skip link's slide-in stop
                for _ in range(50):
                    p.wait_for_timeout(100)
                    now = p.evaluate('[scrollY, Math.round(document.activeElement.getBoundingClientRect().top)]')
                    if now == last:
                        break
                    last = now
                if (c := covered()):
                    problems.append(f'{path}: {c}')
        settle(p, f'/app/{ORG}/investigations')
        p.get_by_role('button', name='Map', exact=True).click()
        attribution = p.locator('.maplibregl-ctrl-attrib')
        expect(attribution).to_be_visible(timeout=20000)
        attribution.scroll_into_view_if_needed()
        p.wait_for_timeout(300)
        top = attribution.evaluate('el => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el.contains(t); }')
        assert top, 'map attribution is covered'
        assert not problems, problems


def test_every_required_page_reflows_at_every_width():  # I05
    share = share_path()
    with browser() as p:
        def check(path):
            over = {}
            for w in WIDTHS:
                p.set_viewport_size({'width': w, 'height': 900})
                p.wait_for_timeout(250)
                if (o := p.evaluate('document.documentElement.scrollWidth - window.innerWidth')) > 1:
                    over[w] = o
            p.set_viewport_size({'width': 1440, 'height': 900})
            return over
        found = every_page(p, check, share)
        assert not found, found


def test_keyboard_only_task_measurement_map_review_and_acknowledgment():  # I06 (reporting: test_keyboard_only_report)
    task = new_task()
    r = assign(task, 'monitor')
    assert r.status_code == 200, r.text
    with browser() as p:  # field task: accept, then record a replicate
        signed_in(p, 'monitor')
        settle(p, f"/app/{ORG}/tasks/{task['id']}")
        tab_to(p, p.get_by_role('button', name='Accept').first)
        p.keyboard.press('Enter')
        expect(p.get_by_text('Task accept recorded.')).to_be_visible()
        tab_to(p, p.locator('#v0'))
        p.keyboard.type('452')
        tab_to(p, p.locator('#t0'))
        p.keyboard.type('14.2')
        tab_to(p, p.get_by_role('button', name='Submit readings'))
        p.keyboard.press('Enter')
        expect(p.get_by_text('Received, pending quality review.')).to_be_visible()
    with browser() as p:  # map alternative: switch to the map, reach a located case in the list, select a station without the map
        signed_in(p)
        settle(p, f'/app/{ORG}/investigations')
        tab_to(p, p.get_by_role('button', name='Map', exact=True))
        p.keyboard.press('Enter')
        expect(p.get_by_role('button', name='Map', exact=True)).to_have_attribute('aria-pressed', 'true')
        tab_to(p, p.get_by_label(re.compile('Search')).first)  # filter by keyboard; test cases crowd the first page
        p.keyboard.type('Mill Brook')
        expect(p.get_by_role('link', name=re.compile('Mill Brook')).first).to_be_visible(timeout=15000)
        tab_to(p, p.get_by_role('link', name=re.compile('Mill Brook')).first)
        p.keyboard.press('Enter')
        expect(p).to_have_url(re.compile(r'/investigations/[0-9a-f-]+$'))
        settle(p, p.url.replace(BASE, '') + '/map-setup')
        station = p.locator('.station-list button').first
        tab_to(p, station)
        p.keyboard.press('Enter')
        expect(station).to_have_attribute('aria-pressed', 'true')
    case = scenario()
    compute(case)
    with browser() as p:  # evidence review decision
        signed_in(p)
        settle(p, f'/app/{ORG}/investigations/{case}/evidence')
        tab_to(p, p.get_by_label('Rationale (required)'))
        p.keyboard.type('Keyboard review of the anchor and B2 evidence')
        tab_to(p, p.get_by_role('button', name='Approve revision'))
        p.keyboard.press('Enter')
        expect(p.get_by_text(re.compile('approved. Sending to recipients is a separate step'))).to_be_visible()
    share = share_path()
    with browser() as p:  # recipient acknowledgment, no account
        settle(p, share)
        tab_to(p, p.get_by_label('Your name or role'))
        p.keyboard.type('Keyboard duty officer')
        p.keyboard.press('Enter')
        expect(p.get_by_text(re.compile('Acknowledged by Keyboard duty officer'))).to_be_visible()


def test_headings_route_focus_and_error_summary():  # I07 (revision announcement: test_map_waits_for_the_result_and_announces_changes_alike)
    share = share_path()
    with browser() as p:
        def check(path):
            levels = p.evaluate('''() => [...document.querySelectorAll("#main-content h1, #main-content h2, #main-content h3, #main-content h4")]
                .filter(h => !h.closest("[hidden], details:not([open])") && getComputedStyle(h).display !== "none").map(h => +h.tagName[1])''')
            problems = []
            if levels.count(1) != 1 or levels[0] != 1:
                problems.append(f'h1 {levels[:3]}')
            problems += [f'h{a}->h{b}' for a, b in zip(levels, levels[1:]) if b > a + 1]
            return problems
        found = every_page(p, check, share)
        settle(p, f'/app/{ORG}/investigations')
        p.get_by_role('link', name='Field tasks').first.click()
        expect(p).to_have_url(re.compile('/tasks$'))
        expect(p.locator('#main-content h1')).to_be_focused()  # focus lands on the new page's heading
        assert not found, found
    with browser() as p:  # report validation: the error summary takes focus and links to the field
        p.goto(BASE + '/report/new')
        summary = p.locator('.inline-error[role=alert]')
        for step in ['Continue to location', 'Continue to review']:  # the first step that validates shows the summary
            p.get_by_role('button', name=step).click()
            p.wait_for_timeout(400)
            if summary.count():
                break
        expect(summary).to_be_focused()
        assert summary.locator('a[href^="#"]').count() >= 1


def test_contrast_zoom_reflow_and_no_colour_only_status():  # I08
    share = share_path()
    with browser() as p:
        def check(path):
            p.evaluate('document.getAnimations().filter(a => a.effect && isFinite(a.effect.getComputedTiming().endTime)).forEach(a => a.finish())')
            p.add_script_tag(path=AXE)
            serious = p.evaluate('async () => (await axe.run(document, {resultTypes: ["violations"]})).violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => v.id + " " + v.nodes[0].target.join(" "))')
            p.set_viewport_size({'width': 720, 'height': 450})  # 200% zoom of a 1440 x 900 window
            p.wait_for_timeout(250)
            zoom = p.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            p.set_viewport_size({'width': 1440, 'height': 900})
            silent = p.evaluate('''() => [...document.querySelectorAll(".badge, .review-state, .quality, .case-status, .status-dot")]
                .filter(e => e.offsetParent && !(e.innerText.trim() || e.getAttribute("aria-label") || (e.parentElement && e.parentElement.innerText.trim()))).map(e => e.className)''')
            return serious + ([f'200% overflow {zoom}px'] if zoom > 1 else []) + silent
        found = every_page(p, check, share)
        assert not found, found


def test_reduced_motion_on_every_page():  # I09 (application setting: test_reduced_motion_is_honoured)
    share = share_path()
    with browser(reduced_motion='reduce') as p:
        def check(path):
            p.wait_for_timeout(500)
            moving = p.evaluate('document.getAnimations().filter(a => a.playState === "running").map(a => (a.effect.target && a.effect.target.className && a.effect.target.className.baseVal !== undefined ? a.effect.target.className.baseVal : a.effect.target && a.effect.target.className) || a.animationName)')
            water = p.locator('[data-motion="water"][data-running="true"]').count()
            return moving + (['water running'] if water else [])
        found = every_page(p, check, share)
        assert not found, found


def test_interrupted_and_repeated_navigation_settle_correctly():  # I10
    with browser() as p:
        signed_in(p)
        settle(p, f'/app/{ORG}/investigations')
        nav = p.get_by_role('navigation', name='Primary')
        for name in ['Field tasks', 'Community', 'Investigations', 'Community']:  # clicks without waiting for the previous route
            nav.get_by_role('link', name=name).click(no_wait_after=True)
        expect(p).to_have_url(re.compile('/community$'))
        expect(p.locator('#main-content h1')).to_have_count(1)
        expect(p.locator('#main-content[aria-busy], .state-page')).to_have_count(0, timeout=15000)
        p.go_back(); p.go_back(); p.go_forward()
        p.wait_for_load_state('networkidle')
        heading = p.locator('#main-content h1').inner_text()
        path = p.url.rsplit('/', 1)[-1]
        assert {'tasks': 'Field tasks', 'investigations': 'Investigations', 'community': ''}.get(path, '') in heading
        expect(p.locator('#main-content[aria-busy], .state-page')).to_have_count(0, timeout=15000)
        assert p.evaluate('getComputedStyle(document.body).pointerEvents') != 'none'


def test_map_waits_for_the_result_and_announces_changes_alike():  # I12 (and I07 revision announcement)
    case = scenario()
    compute(case)
    first = client.get(f'/api/v1/orgs/{ORG}/cases/{case}/assessment', headers=as_('expert')).json()
    with browser(service_workers='block') as p:  # routes must see every API call
        signed_in(p)
        settle(p, f'/app/{ORG}/investigations/{case}')
        before = p.locator('.network-diagram .reach').evaluate_all('rs => rs.map(r => r.getAttribute("class"))')
        r = client.post(f"/api/v1/orgs/{ORG}/instruments/{sid('instrument:SC-014')}/failure", headers=as_('expert'),
                        json={'effective_from': '2026-01-01T00:00:00+00:00', 'effective_until': '2026-01-02T00:00:00+00:00', 'reason': 'Verification failed'})
        assert r.status_code == 200, r.text
        b2 = next(x for x in readings(case) if x['station_code'] == 'B2')
        client.post(f"/api/v1/orgs/{ORG}/readings/{b2['id']}/quality", headers=as_('expert'), json={'disposition': 'excluded', 'reason': 'Failed verification window'})
        held = {'on': True, 'polls': 0}

        def hold(route):  # the analysis reports "running" until released
            response = route.fetch()
            body = response.json()
            if held['on'] and body.get('data', {}).get('state') in ('queued', 'running', 'done'):
                body['data']['state'] = 'running'
                held['polls'] += 1
            route.fulfill(response=response, body=json.dumps(body))
        p.route(re.compile(r'.*/api/v1/orgs/[^/]+/analyses/[^/]+$'), hold)
        p.get_by_role('button', name=re.compile('Recompute with current evidence|Run analysis')).click()
        p.wait_for_timeout(5000)  # several polls answer "running"
        assert held['polls'] >= 2, held  # the hold really intercepted the job status
        assert p.locator('.network-diagram .reach').evaluate_all('rs => rs.map(r => r.getAttribute("class"))') == before
        expect(p.locator('[aria-live=polite]').filter(has_text='Assessment revision')).to_have_count(0)
        held['on'] = False
        expect(p.locator('[aria-live=polite]').filter(has_text=re.compile(r'retained length 2\.30 km → 5\.30 km'))).to_have_count(1, timeout=30000)
        expanded = p.locator('.network-diagram .reach').evaluate_all('rs => rs.map(r => r.getAttribute("class"))')
        assert expanded != before  # the overlay changed only once the complete result existed
        # Reduction: real data cannot be made to narrow on demand, so this test serves the earlier real (2.30 km) assessment
        # back as the next revision. Test-only fixture: it checks the reduction is presented exactly as clearly as the expansion.
        p.unroute(re.compile(r'.*/api/v1/orgs/[^/]+/analyses/[^/]+$'))
        reduced = json.loads(json.dumps(first)); reduced['data']['id'] = '00000000-0000-4000-8000-00000000abcd'; reduced['data']['revision'] = 99
        p.route(re.compile(rf'.*/api/v1/orgs/[^/]+/cases/{case}/assessment$'), lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps(reduced)))
        p.get_by_role('button', name=re.compile('Recompute with current evidence|Run analysis')).click()
        expect(p.locator('[aria-live=polite]').filter(has_text=re.compile(r'retained length 5\.30 km → 2\.30 km'))).to_have_count(1, timeout=30000)
        assert p.locator('.network-diagram .reach').evaluate_all('rs => rs.map(r => r.getAttribute("class"))') == before


def test_no_numeric_count_up():  # I13
    share = share_path()
    with browser() as p:
        p.add_init_script('''window.__numbers = new Map(); new MutationObserver(ms => { for (const m of ms) { const el = m.type === "characterData" ? m.target.parentElement : m.target;
            if (!el || !/\\d/.test(el.textContent || "") || el.textContent.length > 40) continue; const seen = window.__numbers.get(el) || []; seen.push(el.textContent); window.__numbers.set(el, seen); } })
            .observe(document, { subtree: true, characterData: true, childList: true });''')

        def check(path):
            p.wait_for_timeout(1500)
            return p.evaluate('''() => [...window.__numbers.entries()].filter(([el, seen]) => document.contains(el) && new Set(seen.map(s => s.replace(/[^\\d.]/g, ""))).size > 2)
                .map(([el, seen]) => seen.slice(0, 4).join(" > "))''')
        found = every_page(p, check, share)
        assert not found, found


def test_upload_shows_a_true_stage_not_a_made_up_percentage(tmp_path):  # I14
    from PIL import Image
    photo = tmp_path / 'bank.jpg'
    Image.new('RGB', (640, 480), (90, 110, 100)).save(photo)
    from tests.e2e.test_offline import fill_report
    with browser() as p:
        signed_in(p, 'contributor')
        seen = []
        p.route('**/uploads', lambda route: (time.sleep(2.5), route.continue_()))
        fill_report(p, 'Brown water below the ford', photo)
        p.get_by_role('button', name='Submit report').click()
        for _ in range(30):
            text = p.locator('main').inner_text()
            seen.append(text)
            if 'Uploading photo' in text:
                break
            p.wait_for_timeout(100)
        assert any(re.search(r'Uploading photo 1 of 1', t) for t in seen), 'no upload stage shown'
        assert not any(re.search(r'\d+\s?%', t) for t in seen)
        expect(p).to_have_url(re.compile(r'/reports/[0-9a-f-]+'), timeout=30000)


def test_app_screens_are_desktop_layouts():  # I17
    with browser() as p:
        signed_in(p)
        wide = {}
        for path in app_pages():
            settle(p, path)
            width = p.evaluate('document.querySelector("#main-content").getBoundingClientRect().width')
            nav = p.get_by_role('navigation', name='Primary').is_visible() and not p.locator('.menu-toggle').is_visible()
            if width < 1000 or not nav:
                wide[path] = (width, nav)
        assert not wide, wide


HANDOFF = 'C:/Users/safwa/OneDrive/Documents/Hackathon Builds/UpstreamInstructions/NewUI/Upstream-Dark-Handoff/references'


def test_side_by_side_with_the_dark_primary_references(tmp_path):  # I01 (per the amendment: 07-visible-current, dark-investigations)
    """Captures landing and workspace at 1440x900 next to their references (test-results/i01/*.png, for the recorded visual
    inspection) and asserts the reference compositions are present in the real DOM."""
    from pathlib import Path
    from PIL import Image
    out = Path(__file__).resolve().parents[2] / 'test-results' / 'i01'
    out.mkdir(parents=True, exist_ok=True)

    def pair(p, name, reference):
        shot = out / f'{name}.png'
        p.screenshot(path=str(shot))
        if Path(reference).exists():
            ref, ours = Image.open(reference).convert('RGB').resize((1440, 900)), Image.open(shot).convert('RGB')
            both = Image.new('RGB', (2880, 900)); both.paste(ref, (0, 0)); both.paste(ours, (1440, 0)); both.save(out / f'{name}-side-by-side.png')
    with browser() as p:
        settle(p, '/')
        p.wait_for_timeout(3000)
        assert p.locator('.dusk-hero .scene-plate').count() == 1 and p.locator('.dusk-hero .scene-water').count() == 1
        # the route is drawn into the water (WebGL); its SVG copy stays in the DOM and shows only without WebGL
        assert p.locator('.hero-route .lr-origin').count() == 1 and p.locator('.hero-route .lr-main').count() >= 1
        assert p.evaluate('() => "routeGl" in document.documentElement.dataset') or p.locator('.hero-route .lr-origin').is_visible()
        assert p.get_by_role('navigation', name='Primary').get_by_role('link').count() >= 3
        assert p.locator('#main-content a.button-primary').first.is_visible()
        pair(p, 'landing', f'{HANDOFF}/07-visible-current.png')
        signed_in(p)
        settle(p, f'/app/{ORG}/investigations')
        expect(p.locator('[data-map-ready="true"]')).to_be_visible(timeout=20000)  # default view: list beside the map
        p.wait_for_timeout(2500)
        assert p.locator('.case-list .case-row').count() >= 1 and p.locator('.directory-map').is_visible()
        assert p.locator('.map-connectors path:not([style*="display: none"])').count() >= 1  # correspondence lines from real rows
        pair(p, 'workspace', f'{HANDOFF}/dark-investigations.png')


def test_interaction_motion_follows_the_dark_motion_spec():  # I11 (per the amendment: MOTION_SPEC; PRD values where unspecified)
    def ms(value):  # "0.18s, 120ms" -> [180, 120]
        return [round(float(v[:-2])) if v.endswith('ms') else round(float(v[:-1]) * 1000) for v in value.split(', ')]
    with browser() as p:
        signed_in(p, 'coordinator')
        settle(p, f'/app/{ORG}/tasks')
        style = lambda sel, prop, pseudo=None: p.locator(sel).first.evaluate(f'(e, [p, s]) => getComputedStyle(e, s)[p]', [prop, pseudo])
        hover = ms(style('.button', 'transitionDuration'))  # button hover 120-220, press within it
        assert all(120 <= v <= 220 for v in hover), hover
        underline = ms(style('.tab-nav button', 'transitionDuration', '::after'))  # active tab underline 150-220
        assert all(150 <= v <= 220 for v in underline), underline
        panel = ms(style('.task-panel', 'animationDuration'))  # tab/state transition 180-300
        assert all(180 <= v <= 300 for v in panel), panel
        p.get_by_role('tab', name='Available to me').click()
        items = p.locator('.field-task, .empty-state')
        expect(items.first).to_be_visible()
        if p.locator('.field-task').count():  # list entrance 300-450, no stagger beyond the cap
            assert all(300 <= v <= 450 for v in ms(style('.field-task', 'animationDuration')))
        p.locator('.account-menu summary').click()  # drawer: state transition 180-300
        drawer = ms(style('.account-menu .menu-panel', 'animationDuration'))
        assert all(180 <= v <= 300 for v in drawer), drawer
        p.keyboard.press('Escape')
        settle(p, f'/app/{ORG}/settings/profile')
        field = ms(style('#name', 'transitionDuration'))  # form focus hairline: control hover/focus 120-220
        assert all(120 <= v <= 220 for v in field), field
        switch = ms(style('.switch .track', 'transitionDuration'))  # switches respond in 150-220
        assert all(150 <= v <= 220 for v in switch), switch
        settle(p, f'/app/{ORG}/evidence')
        if p.locator('.queue-item').count():  # detail list entrance
            assert all(300 <= v <= 450 for v in ms(style('.queue-item', 'animationDuration')))
