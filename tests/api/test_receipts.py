"""Duplicate suggestions and merge (B09); contribution effect receipts and their revision (B12, B13)."""
from decimal import Decimal
from uuid import uuid4

from scripts.seed_example import sid
from tests.api.test_http import ORG, as_, client, report
from tests.api.test_review import approve, compute, readings, scenario


def submit(**extra):
    r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(**extra), headers=as_('reporter') | {'Idempotency-Key': str(uuid4())})
    assert r.status_code == 201, r.text
    return r.json()['data']


def test_duplicate_suggestion_can_be_rejected_and_merge_preserves_both_reports():  # B09
    lat, lon = 51.47 + (uuid4().int % 1000) / 1e6, -2.61  # fresh spot per run
    first = submit(latitude=lat, longitude=lon, accuracy_m=10, location_method='gps', location_precision='approximate')
    s = client.get(f'/api/v1/orgs/{ORG}/duplicate-suggestions', params={'lat': lat + .0005, 'lon': lon, 'observed_at': '2026-09-20T12:00:00+01:00'},
                   headers=as_('reporter')).json()['data']
    assert first['case_id'] in [x['case_id'] for x in s] and all('description' not in x for x in s)
    # The citizen says "this is a new observation": a separate case is created, nothing merged automatically.
    second = submit(latitude=lat + .0005, longitude=lon, new_observation=True, suggested_case_id=first['case_id'])
    assert second['case_id'] != first['case_id']
    version = client.get(f"/api/v1/orgs/{ORG}/cases/{second['case_id']}", headers=as_('coordinator')).json()['data']['version']
    assert client.post(f"/api/v1/orgs/{ORG}/cases/{second['case_id']}/merge", headers=as_('reporter'),
                       json={'into_case_id': first['case_id'], 'expected_version': version, 'reason': 'Same outfall, same afternoon'}).status_code == 403
    m = client.post(f"/api/v1/orgs/{ORG}/cases/{second['case_id']}/merge", headers=as_('coordinator'),
                    json={'into_case_id': first['case_id'], 'expected_version': version, 'reason': 'Same outfall, same afternoon'})
    assert m.status_code == 200, m.text
    target = client.get(f"/api/v1/orgs/{ORG}/cases/{first['case_id']}", headers=as_('coordinator')).json()['data']
    assert {r['id'] for r in target['reports']} == {first['id'], second['id']}
    source = client.get(f"/api/v1/orgs/{ORG}/cases/{second['case_id']}", headers=as_('coordinator')).json()['data']
    assert source['merged_into'] == first['case_id']
    mine = client.get(f"/api/v1/orgs/{ORG}/reports/{second['id']}", headers=as_('reporter')).json()['data']
    assert mine['id'] == second['id']  # the reporter still owns and sees the original report record


def test_receipts_show_effect_and_become_revised_after_supersession():  # B12 B13
    case = scenario()
    first = compute(case)
    assert approve(first['id']).status_code == 200
    report_id = client.get(f'/api/v1/orgs/{ORG}/cases/{case}', headers=as_('coordinator')).json()['data']['reports'][0]['id']
    [r1] = client.get(f'/api/v1/orgs/{ORG}/reports/{report_id}/receipts', headers=as_('contributor')).json()['data']
    assert r1['effect'] == 'recorded_for_triage' and r1['revision'] == first['revision'] and r1['status'] == 'approved'
    assert Decimal(r1['retained_after_m']) == Decimal('2300')
    monitor = [x for x in client.get(f'/api/v1/orgs/{ORG}/receipts', headers=as_('monitor')).json()['data'] if x['case_id'] == case]
    assert {x['effect'] for x in monitor} == {'used_in_assessment'} and all(x['co_dependencies'] >= 1 for x in monitor)
    # Revision: B2 excluded; the new approval supersedes the first receipt's assessment.
    client.post(f"/api/v1/orgs/{ORG}/instruments/{sid('instrument:SC-014')}/failure", headers=as_('expert'),
                json={'effective_from': '2026-01-01T00:00:00+00:00', 'effective_until': '2026-01-02T00:00:00+00:00', 'reason': 'Verification failed'})
    b2 = next(x for x in readings(case) if x['station_code'] == 'B2')
    client.post(f"/api/v1/orgs/{ORG}/readings/{b2['id']}/quality", headers=as_('expert'), json={'disposition': 'excluded', 'reason': 'Failed verification window'})
    second = compute(case)
    assert approve(second['id']).status_code == 200
    receipts = client.get(f'/api/v1/orgs/{ORG}/reports/{report_id}/receipts', headers=as_('contributor')).json()['data']
    assert [x['revision'] for x in receipts] == [second['revision'], first['revision']]
    assert receipts[1]['status'] == 'superseded' and Decimal(receipts[1]['retained_after_m']) == Decimal('2300')  # history intact
    assert Decimal(receipts[0]['retained_before_m']) == Decimal('2300') and Decimal(receipts[0]['retained_after_m']) == Decimal('5300')
    b2_receipts = [x for x in client.get(f'/api/v1/orgs/{ORG}/receipts', headers=as_('monitor')).json()['data'] if x['reading_id'] == b2['id']]
    assert {x['effect'] for x in b2_receipts} == {'used_in_assessment', 'excluded_after_review'}  # excluded later, history kept
