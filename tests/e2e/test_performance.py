"""J01 public performance budgets and J03 large-directory behaviour, measured in Chromium against `next start` + API.

Profiles: desktop 1440x900 unthrottled; mobile 390x844 with CDP throttling (150 ms latency, 1.6 Mbit/s down,
750 kbit/s up, CPU 4x slower). Requires `python scripts/seed_load.py` (10,000 synthetic cases in a separate example org).
Measured values are printed and recorded in docs/performance.md.
"""
import gzip
import re
import statistics
import time

import httpx
from playwright.sync_api import expect, sync_playwright

from scripts.seed_load import LOAD_ORG
from tests.api.test_http import as_
from tests.e2e.test_report_flow import BASE, sign_in

LCP_CLS = """() => new Promise(done => {
  let lcp = 0, cls = 0;
  new PerformanceObserver(l => l.getEntries().forEach(e => lcp = Math.max(lcp, e.startTime))).observe({type: 'largest-contentful-paint', buffered: true});
  new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) cls += e.value; })).observe({type: 'layout-shift', buffered: true});
  setTimeout(() => done({lcp, cls}), 2500);
})"""


def measure_landing(pw, mobile):
    browser = pw.chromium.launch()
    context = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1440, 'height': 900})
    p = context.new_page()
    if mobile:
        cdp = context.new_cdp_session(p)
        cdp.send('Network.enable')
        cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1_600_000 / 8, 'uploadThroughput': 750_000 / 8})
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    scripts = {}
    p.on('response', lambda r: scripts.__setitem__(r.url, r) if r.request.resource_type == 'script' else None)
    p.goto(BASE + '/', wait_until='load')
    initial = set(p.eval_on_selector_all('script[src]', 'els => els.map(e => e.src)'))  # the landing page's own bundle, not later route prefetches
    metrics = p.evaluate(LCP_CLS)
    js_gzip = sum(len(gzip.compress(r.body())) for url, r in scripts.items() if url in initial and r.ok)
    browser.close()
    return metrics, js_gzip


def test_public_landing_budgets():  # J01
    with sync_playwright() as pw:
        desktop, js = measure_landing(pw, mobile=False)
        mobile, _ = measure_landing(pw, mobile=True)
    print(f'J01 desktop LCP {desktop["lcp"]:.0f} ms CLS {desktop["cls"]:.3f}; mobile LCP {mobile["lcp"]:.0f} ms CLS {mobile["cls"]:.3f}; initial JS {js / 1024:.0f} KB gzip')
    assert desktop['lcp'] <= 2500 and mobile['lcp'] <= 2500
    assert desktop['cls'] <= 0.1 and mobile['cls'] <= 0.1
    assert js <= 250 * 1024


def test_ten_thousand_case_directory_reads_stay_fast():  # J03 (API p95 on the seeded 10k workspace)
    headers = as_('coordinator')
    timings = []
    with httpx.Client(base_url='http://127.0.0.1:8000', headers=headers, timeout=10) as http:
        cursor = ''
        for i in range(30):
            params = {'limit': 25, 'cursor': cursor} if i % 3 else {'q': f'Load stream {i * 97}'}
            start = time.perf_counter()
            r = http.get(f'/api/v1/orgs/{LOAD_ORG}/cases', params=params)
            timings.append((time.perf_counter() - start) * 1000)
            assert r.status_code == 200
            cursor = r.json()['data']['next_cursor'] or ''
    p95 = statistics.quantiles(timings, n=20)[18]
    print(f'J03 directory read p95 {p95:.0f} ms over {len(timings)} requests')
    assert p95 < 500


def test_directory_and_map_render_are_bounded():  # J03 (500 visible map features, no unbounded DOM)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        p = browser.new_context(viewport={'width': 1440, 'height': 900}).new_page()
        p.goto(BASE + '/sign-in')
        sign_in(p, 'coordinator@example.test')
        expect(p).to_have_url(re.compile('/investigations'))
        p.goto(f'{BASE}/app/{LOAD_ORG}/investigations')
        rows = p.get_by_role('list', name='Investigations').locator('> li')
        expect(rows).to_have_count(25)  # paginated, never the whole table
        for n in range(2, 25):
            p.get_by_role('button', name='Show more').click()
            expect(rows).to_have_count(25 * n)
            if 25 * n >= 600:
                break
        started = time.perf_counter()
        p.get_by_role('button', name='Map', exact=True).click()
        expect(p.locator('[data-map-ready="true"]')).to_be_visible(timeout=20000)
        p.wait_for_timeout(500)
        elapsed = time.perf_counter() - started
        in_map = p.evaluate('document.querySelector("[data-map-ready]").querySelectorAll("*").length')
        located = p.evaluate('document.querySelector("figcaption").innerText')
        print(f'J03 map with {located!r} ready in {elapsed:.1f} s; {in_map} DOM nodes inside the map')
        assert in_map < 200  # features are drawn in WebGL layers, not one DOM marker each
        assert elapsed < 10
        browser.close()
