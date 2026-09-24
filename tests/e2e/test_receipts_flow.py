"""Receipts show the actual effect and revision (B12, B13); duplicates are suggested, rejected, then merged by a coordinator (B09)."""
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from playwright.sync_api import expect

from scripts.seed_example import sid
from tests.api.test_http import ORG, as_, client, fresh_contributor, report
from tests.api.test_review import approve, compute, readings, scenario
from tests.e2e.test_report_flow import BASE, page  # noqa: F401
from tests.e2e.test_task_flow import open_as


def test_receipt_shows_effect_then_revision(page):  # B12 B13 (browser path)
    case = scenario()
    first = compute(case)
    assert approve(first['id']).status_code == 200
    report_id = client.get(f'/api/v1/orgs/{ORG}/cases/{case}', headers=as_('coordinator')).json()['data']['reports'][0]['id']
    open_as(page, 'contributor@example.test')
    page.goto(f'{BASE}/app/{ORG}/reports/{report_id}')
    expect(page.get_by_text(f"Based on assessment {first['revision']}")).to_be_visible()
    expect(page.get_by_text(re.compile('it was not a measurement input'))).to_be_visible()
    client.post(f"/api/v1/orgs/{ORG}/instruments/{sid('instrument:SC-014')}/failure", headers=as_('expert'),
                json={'effective_from': '2026-01-01T00:00:00+00:00', 'effective_until': '2026-01-02T00:00:00+00:00', 'reason': 'Verification failed'})
    b2 = next(x for x in readings(case) if x['station_code'] == 'B2')
    client.post(f"/api/v1/orgs/{ORG}/readings/{b2['id']}/quality", headers=as_('expert'), json={'disposition': 'excluded', 'reason': 'Failed verification window'})
    page.reload()
    expect(page.get_by_text(re.compile('This assessment was revised and is under review'))).to_be_visible()
    second = compute(case)
    assert approve(second['id']).status_code == 200
    page.reload()
    expect(page.get_by_text(f"Based on assessment {second['revision']}")).to_be_visible()
    expect(page.get_by_text(re.compile(r'changed from 2\.30 km to 5\.30 km'))).to_be_visible()
    page.get_by_text('Earlier receipts (1)').click()
    expect(page.get_by_text(re.compile(f"Assessment {first['revision']} · This assessment was revised"))).to_be_visible()


def test_duplicate_suggested_rejected_and_merged(page):  # B09 (browser path)
    lat, lon = 51.48 + (uuid4().int % 1000) / 1e6, -2.62
    recent = (datetime.now(timezone.utc) - timedelta(hours=2)).replace(microsecond=0).isoformat()  # inside the 3-day suggestion window
    first = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(latitude=lat, longitude=lon, local_name=f'Dup test {uuid4().hex[:5]}', observed_at=recent),
                        headers=as_('reporter') | {'Idempotency-Key': str(uuid4())}).json()['data']
    open_as(page, fresh_contributor())
    page.goto(BASE + '/report/new')
    page.get_by_label('Unusual foam').check()
    page.get_by_role('button', name='Continue to location').click()
    page.get_by_label('Latitude (optional)').fill(str(lat))
    page.get_by_label('Longitude (optional)').fill(str(lon))
    page.get_by_role('button', name='Continue to review').click()
    expect(page.get_by_text('Possibly related investigations nearby')).to_be_visible()
    expect(page.get_by_label('This is a new observation')).to_be_checked()
    page.get_by_role('button', name='Submit report').click()
    expect(page).to_have_url(re.compile(r'/reports/[0-9a-f-]+'))
    second_case = page.get_by_role('link', name=re.compile('Unnamed stream|Dup test')).first.get_attribute('href').split('/')[-1]
    assert second_case != first['case_id']
    coordinator = page.context.browser.new_context().new_page()
    open_as(coordinator, 'coordinator@example.test')
    coordinator.goto(f'{BASE}/app/{ORG}/investigations/{second_case}')
    title = client.get(f"/api/v1/orgs/{ORG}/cases/{first['case_id']}", headers=as_('coordinator')).json()['data']['title']
    coordinator.get_by_label('Find the investigation this duplicates').fill(title)
    coordinator.get_by_label(re.compile(re.escape(title))).check()
    coordinator.get_by_label('Reason').fill('Same foam event at the same spot')
    coordinator.get_by_role('button', name='Merge into selected investigation').click()
    expect(coordinator.get_by_text(re.compile('This investigation was merged'))).to_be_visible()
    merged = client.get(f"/api/v1/orgs/{ORG}/cases/{first['case_id']}", headers=as_('coordinator')).json()['data']
    assert len(merged['reports']) == 2
