"""Expert review, approval, revision and decisions on the revised-evidence scenario (group F, D11)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from scripts.seed_example import seed_revised_scenario, sid
from services.worker.__main__ import work_once
from tests.api.test_http import ORG, as_, client


def scenario():
    key = uuid4().hex[:8]
    return seed_revised_scenario(ORG, key=f'revised-{key}', title=f'Revised evidence test {key}')


def compute(case):
    job = client.post(f'/api/v1/orgs/{ORG}/cases/{case}/analyses', headers=as_('coordinator'))
    assert job.status_code == 202, job.text
    while client.get(f"/api/v1/orgs/{ORG}/analyses/{job.json()['data']['id']}", headers=as_('coordinator')).json()['data']['state'] != 'done':
        assert work_once()
    return client.get(f'/api/v1/orgs/{ORG}/cases/{case}/assessment', headers=as_('expert')).json()['data']


def approve(aid, role='expert'):
    return client.post(f'/api/v1/orgs/{ORG}/assessments/{aid}/approve', json={'reason': 'Reviewed evidence, assumptions and exclusions'}, headers=as_(role))


def history(case):
    return {a['revision']: a for a in client.get(f'/api/v1/orgs/{ORG}/cases/{case}/assessments', headers=as_('expert')).json()['data']}


def readings(case):
    return client.get(f'/api/v1/orgs/{ORG}/cases/{case}/readings', headers=as_('expert')).json()['data']


def test_only_experts_approve():  # F03
    case = scenario()
    a = compute(case)
    assert Decimal(a['retained_length_m']) == Decimal('2300')
    assert approve(a['id'], 'admin').status_code == 403
    assert approve(a['id'], 'coordinator').status_code == 403
    assert approve(a['id']).status_code == 200


def test_instrument_failure_review_exclusion_and_supersession():  # D11 F01 F04 F05
    case = scenario()
    first = compute(case)
    assert approve(first['id']).status_code == 200
    net = client.get(f'/api/v1/orgs/{ORG}/cases/{case}/network', headers=as_('coordinator')).json()['data']
    start = datetime.now(timezone.utc) + timedelta(days=5)
    task = client.post(f'/api/v1/orgs/{ORG}/tasks', headers=as_('coordinator'), json={
        'case_id': case, 'task_type': 'conductance_reading', 'purpose': 'Measure at B3 from the approved assessment',
        'station_id': next(s['id'] for s in net['stations'] if s['code'] == 'B3'), 'rationale_hash': first['snapshot_hash'],
        'window_start': start.isoformat(), 'window_end': (start + timedelta(hours=2)).isoformat()}).json()['data']
    r = client.post(f"/api/v1/orgs/{ORG}/instruments/{sid('instrument:SC-014')}/failure", headers=as_('expert'),
                    json={'effective_from': '2026-01-01T00:00:00+00:00', 'effective_until': '2026-01-02T00:00:00+00:00',
                          'reason': 'Post-deployment check against standard failed'})
    assert r.status_code == 200, r.text
    assert r.json()['data']['suspect_readings'] >= 1 and r.json()['data']['assessments_under_review'] >= 1
    b2 = next(x for x in readings(case) if x['station_code'] == 'B2')
    assert b2['quality'] == 'suspect'  # held for review, not deleted
    assert [p['status'] for p in history(case)[first['revision']]['publications']][-1] == 'under_review'
    assert client.get(f'/api/v1/orgs/{ORG}/cases/{case}', headers=as_('expert')).json()['data']['review_hold']
    assert client.get(f"/api/v1/orgs/{ORG}/tasks/{task['id']}", headers=as_('coordinator')).json()['data']['state'] == 'needs_revision'
    q = client.post(f"/api/v1/orgs/{ORG}/readings/{b2['id']}/quality", headers=as_('expert'),
                    json={'disposition': 'excluded', 'reason': 'Instrument failed verification covering this reading'})
    assert q.status_code == 200
    second = compute(case)
    assert Decimal(second['retained_length_m']) == Decimal('5300') and second['revision'] > first['revision']  # area expands
    assert approve(second['id']).status_code == 200
    h = history(case)
    assert [p['status'] for p in h[first['revision']]['publications']] == ['draft', 'approved', 'under_review', 'superseded']
    assert Decimal(h[first['revision']]['retained_length_m']) == Decimal('2300')  # approved record itself never rewritten
    assert h[second['revision']]['current'] and not client.get(f'/api/v1/orgs/{ORG}/cases/{case}', headers=as_('expert')).json()['data']['review_hold']


def test_changed_dependency_blocks_approval():  # F02
    case = scenario()
    a = compute(case)
    a3 = next(x for x in readings(case) if x['station_code'] == 'A3')
    assert client.post(f"/api/v1/orgs/{ORG}/readings/{a3['id']}/quality", headers=as_('coordinator'),
                       json={'disposition': 'suspect', 'reason': 'Probe fouling noted on the field sheet'}).status_code == 200
    r = approve(a['id'])
    assert r.status_code == 409 and r.json()['error']['code'] == 'DEPENDENCY_CHANGED'


def test_request_more_evidence_and_inspection_decision_coexist_with_limits():  # F10
    case = scenario()
    a = compute(case)
    r = client.post(f"/api/v1/orgs/{ORG}/assessments/{a['id']}/review", json={'action': 'more_evidence', 'reason': 'Need a repeat at B2 first'}, headers=as_('expert'))
    assert r.json()['data']['status'] == 'more_evidence'
    assert approve(a['id']).status_code == 409  # no longer a draft
    b = a  # retained classes stay a structural limit; inspection is a separate expert decision
    version = client.get(f'/api/v1/orgs/{ORG}/cases/{case}', headers=as_('expert')).json()['data']['version']
    retained = [c['id'] for c in b['classes'] if c['status'] != 'incompatible']
    d = client.post(f'/api/v1/orgs/{ORG}/cases/{case}/decisions', headers=as_('expert'), json={
        'expected_version': version, 'action': 'inspection_recommended', 'reason': 'Inspect retained upper B segments on foot',
        'assessment_id': b['id'], 'segments': retained})
    assert d.status_code == 201, d.text
    assert d.json()['data']['workflow'] == 'inspection_recommended'
    stale = client.post(f'/api/v1/orgs/{ORG}/cases/{case}/decisions', headers=as_('expert'), json={
        'expected_version': version, 'action': 'escalated', 'reason': 'Escalate to the local authority'})
    assert stale.status_code == 409
    assert client.post(f'/api/v1/orgs/{ORG}/cases/{case}/decisions', headers=as_('admin'), json={
        'expected_version': version + 1, 'action': 'escalated', 'reason': 'Escalate to the local authority'}).status_code == 403
    again = client.get(f'/api/v1/orgs/{ORG}/cases/{case}/assessment', headers=as_('expert')).json()['data']
    assert again['retained_length_m'] == a['retained_length_m']
