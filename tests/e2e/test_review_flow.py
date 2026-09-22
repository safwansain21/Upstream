"""Expert reviews and approves in the browser; an instrument failure then yields an expanded revision to approve."""
import re

from playwright.sync_api import expect

from scripts.seed_example import sid
from tests.api.test_http import ORG, as_, client
from tests.api.test_review import compute, readings, scenario
from tests.e2e.test_report_flow import BASE, page  # noqa: F401
from tests.e2e.test_task_flow import open_as


def test_expert_approves_then_reviews_expanded_revision(page):  # F01 F03 F04 F05 (browser path)
    case = scenario()
    compute(case)
    open_as(page, 'expert@example.test')
    page.goto(f'{BASE}/app/{ORG}/evidence')
    expect(page.get_by_role('link', name=re.compile('Revised evidence test'))).not_to_have_count(0)
    page.goto(f'{BASE}/app/{ORG}/investigations/{case}/evidence')
    expect(page.get_by_text('2.30 km').first).to_be_visible()
    page.get_by_label('Rationale (required)').fill('Anchor and B2 evidence reviewed against the protocol')
    page.get_by_role('button', name='Approve revision').click()
    expect(page.get_by_text(re.compile('approved. Sending to recipients is a separate step'))).to_be_visible()

    r = client.post(f"/api/v1/orgs/{ORG}/instruments/{sid('instrument:SC-014')}/failure", headers=as_('expert'),
                    json={'effective_from': '2026-01-01T00:00:00+00:00', 'effective_until': '2026-01-02T00:00:00+00:00', 'reason': 'Verification failed'})
    assert r.status_code == 200
    b2 = next(x for x in readings(case) if x['station_code'] == 'B2')
    client.post(f"/api/v1/orgs/{ORG}/readings/{b2['id']}/quality", headers=as_('expert'), json={'disposition': 'excluded', 'reason': 'Failed verification window'})
    compute(case)
    page.reload()
    expect(page.get_by_role('heading', name='A revision worth reviewing')).to_be_visible()
    expect(page.get_by_text('Candidate area expanded by 3.00 km.')).to_be_visible()
    expect(page.get_by_text(re.compile('Review required'))).to_be_visible()
    page.get_by_label('Rationale (required)').fill('Exclusion of B2 reviewed; wider area accepted')
    page.get_by_role('button', name='Approve revision').click()
    expect(page.get_by_text(re.compile('approved. Sending'))).to_be_visible()
    expect(page.get_by_text(re.compile('approved → under_review → superseded'))).to_be_visible()


def test_admin_sees_no_approval_controls(page):  # F03 (UI)
    case = scenario()
    compute(case)
    open_as(page, 'admin@example.test')
    page.goto(f'{BASE}/app/{ORG}/investigations/{case}/evidence')
    expect(page.get_by_text('Evidence is not available to you')).to_be_visible()
    expect(page.get_by_role('button', name='Approve revision')).to_have_count(0)


def queued_analysis(page):
    """Approved case whose recompute request is held in the queue (as if new evidence were waiting); returns the case and job status."""
    import json
    from services.api.db import transaction
    from tests.api.test_review import approve
    case = scenario()
    first = compute(case)
    assert approve(first['id']).status_code == 200
    held = {'first': first}

    def park(route):  # the real request; the reused job is then put back in the queue for an hour
        job = route.fetch().json()['data']
        with transaction(worker=True) as db:
            db.execute("update analysis_jobs set state='queued',result_id=null,progress_stage='Queued',available_at=now()+interval '1 hour' where id=%s", (job['id'],))
        held['status'] = client.get(f"/api/v1/orgs/{ORG}/analyses/{job['id']}", headers=as_('coordinator')).json()
        route.fulfill(status=202, content_type='application/json', body=json.dumps(held['status']))
    page.route(re.compile(r'.*/api/v1/orgs/[^/]+/cases/[^/]+/analyses$'), park)
    return case, held


def test_cancel_analysis_button_stops_queued_work_and_keeps_results(page):  # J02 (browser path)
    from services.api.db import transaction
    from tests.api.test_review import history
    case, held = queued_analysis(page)
    first = held['first']
    open_as(page, 'coordinator@example.test')
    page.goto(f'{BASE}/app/{ORG}/investigations/{case}')
    page.get_by_role('button', name='Recompute with current evidence').click()
    expect(page.get_by_text(re.compile('Queued · .*showing previous assessment'))).to_be_visible()
    expect(page.get_by_role('button', name='Recompute with current evidence')).to_be_disabled()
    page.get_by_role('button', name='Cancel analysis').click()
    expect(page.get_by_text('Analysis cancelled. Earlier results are unchanged.')).to_be_visible()
    expect(page.get_by_role('button', name='Cancel analysis')).to_have_count(0)
    expect(page.get_by_role('button', name='Recompute with current evidence')).to_be_enabled()
    with transaction(worker=True) as db:
        assert db.execute("select state from analysis_jobs where case_id=%s and purpose='assessment' order by created_at desc limit 1", (case,)).fetchone()['state'] == 'cancelled'
    assert [r for r, a in history(case).items() if a['current']] == [first['revision']]
    page.get_by_role('link', name='History', exact=True).click()  # the workspace stays navigable
    expect(page).to_have_url(re.compile(f'/investigations/{case}/history'))


def test_decision_view_shows_sourced_context_and_suggestions(page):  # F11 (browser path)
    from uuid import uuid4
    from tests.api.test_context import add_layers, recipient
    case = scenario()
    compute(case)
    name = f'Farm liaison {uuid4().hex[:6]}'
    recipient(name, ['animal_access'])
    add_layers(case)
    open_as(page, 'expert@example.test')
    page.goto(f'{BASE}/app/{ORG}/investigations/{case}/decision')
    cattle = 'Animal access (source: Example cattle drinking point (synthetic), synthetic)'
    expect(page.get_by_text(f'{cattle} · licence CC0-1.0')).to_be_visible()
    expect(page.get_by_text('Habitat (source: Example otter holt register (synthetic), synthetic) · licence CC0-1.0')).to_be_visible()
    expect(page.get_by_text('Attention: elevated')).to_be_visible()
    expect(page.get_by_text(f'{name}: handles {cattle}')).to_be_visible()
    expect(page.get_by_text('The expert chooses recipients and purpose.', exact=False)).to_be_visible()
    expect(page.get_by_text('No health outcome is established or assessed by Upstream.')).to_be_visible()


def test_late_poll_never_reverts_a_cancelled_analysis(page):  # H11 (polling is the only status channel; no stream to fail)
    import json
    case, held = queued_analysis(page)
    polls = []
    page.route(re.compile(r'.*/api/v1/orgs/[^/]+/analyses/[0-9a-f-]+$'), lambda route: polls.append(route) if route.request.method == 'GET' else route.continue_())
    open_as(page, 'coordinator@example.test')
    page.goto(f'{BASE}/app/{ORG}/investigations/{case}')
    page.get_by_role('button', name='Recompute with current evidence').click()
    expect(page.get_by_text(re.compile('Queued · '))).to_be_visible()
    for _ in range(50):  # a status poll is now in flight and held
        if polls:
            break
        page.wait_for_timeout(100)
    page.get_by_role('button', name='Cancel analysis').click()
    expect(page.get_by_text('Analysis cancelled. Earlier results are unchanged.')).to_be_visible()
    stale = json.dumps(held['status'])  # the earlier queued state, delivered after the cancellation
    for route in polls:
        route.fulfill(status=200, content_type='application/json', body=stale)
    page.evaluate("() => new Promise(r => setTimeout(r, 2000))")
    expect(page.get_by_text('Analysis cancelled. Earlier results are unchanged.')).to_be_visible()
    expect(page.get_by_role('button', name='Cancel analysis')).to_have_count(0)
