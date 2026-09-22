"""Tasks, assignment, access and reading capture through the real RPCs (group D)."""
import itertools
import random
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from scripts.seed_example import sid, synthetic
from tests.api.test_analysis import case_id
from tests.api.test_http import ORG, as_, client

NOW = datetime.now(timezone.utc).replace(microsecond=0)
# Instrument bookings persist between runs: give every task in this run its own future window.
WINDOWS = (NOW + timedelta(days=random.randint(2, 380), hours=3 * i) for i in itertools.count())  # inside example qualification/calibration validity


CASE = 'Harbour channel'  # field-work tests stay off Mill Brook so its canonical assessment is untouched


def station(code, title=CASE):
    net = client.get(f'/api/v1/orgs/{ORG}/cases/{case_id(title)}/network', headers=as_('coordinator')).json()['data']
    return next(s['id'] for s in net['stations'] if s['code'] == code)


def new_task(task_type='conductance_reading', code='B2', start=None, hours=2, protocol=True):
    start = start or next(WINDOWS)
    body = {'case_id': case_id(CASE), 'task_type': task_type, 'station_id': station(code) if code else None,
            'purpose': f'Example: measure at {code} to help distinguish retained reaches.',
            'window_start': start.isoformat(), 'window_end': (start + timedelta(hours=hours)).isoformat()}
    if protocol:
        body['protocol_id'] = sid('protocol:1')
    r = client.post(f'/api/v1/orgs/{ORG}/tasks', json=body, headers=as_('coordinator'))
    assert r.status_code == 201, r.text
    return r.json()['data']


def assign(task, person_role, meter='SC-009', version=None):
    me = client.get('/api/v1/me', headers=as_(person_role)).json()['data']['user_id']
    return client.post(f"/api/v1/orgs/{ORG}/tasks/{task['id']}/assign", headers=as_('coordinator'),
                       json={'expected_version': version or task['version'], 'assignee_id': me,
                             'instrument_id': sid(f'instrument:{meter}') if meter else None})


def transition(task_id, role, action, version, reason=''):
    return client.post(f'/api/v1/orgs/{ORG}/tasks/{task_id}/transition', headers=as_(role),
                       json={'expected_version': version, 'action': action, 'reason': reason})


def accepted_task(meter='SC-009'):
    task = new_task()
    r = assign(task, 'monitor', meter)
    assert r.status_code == 200, r.text
    r = transition(task['id'], 'monitor', 'accept', r.json()['data']['version'])
    assert r.status_code == 200, r.text
    return r.json()['data']


def readings(task, replicates, mode='raw', unit='uS/cm', version=None, client_id=None):
    body = {'client_id': client_id or str(uuid4()), 'task_version': version or task['version'], 'started_at': NOW.isoformat(),
            'mode': mode, 'unit': unit, 'replicates': replicates}
    return client.post(f"/api/v1/orgs/{ORG}/tasks/{task['id']}/readings", json=body, headers=as_('monitor'))


def rep(value='452', temperature='14.2', minutes=0, **extra):
    return {'value': value, 'temperature': temperature, 'measured_at': (NOW - timedelta(minutes=10 - minutes)).isoformat()} | extra


def test_assignment_checks_qualification_instrument_version_and_limitations():  # D01 D14
    task = new_task()
    assert 'may not narrow' in task['limitations']
    assert assign(task, 'contributor').status_code == 403  # not qualified
    r = assign(task, 'monitor', meter=None)
    assert r.status_code == 422 and r.json()['error']['code'] == 'READINESS_REQUIRED'
    assert assign(task, 'monitor', version=task['version'] + 5).status_code == 409  # stale client version
    assert assign(task, 'monitor').status_code == 200
    forged = client.post(f"/api/v1/orgs/{ORG}/tasks/{task['id']}/assign", headers=as_('monitor'),
                         json={'expected_version': 2, 'assignee_id': str(uuid4())})
    assert forged.status_code == 403  # monitors cannot assign


def test_concurrent_instrument_bookings_admit_one():  # D03
    start = next(WINDOWS)
    a, b = new_task(start=start), new_task(start=start + timedelta(minutes=30))
    with ThreadPoolExecutor(2) as pool:
        codes = sorted(f.result().status_code for f in [pool.submit(assign, t, 'monitor', 'SC-014') for t in (a, b)])
    assert codes == [200, 409]


def test_two_claims_yield_one_assignment_and_one_conflict():  # D02
    task = new_task('location_confirmation', code=None, protocol=False)
    with ThreadPoolExecutor(2) as pool:
        results = [pool.submit(transition, task['id'], role, 'claim', task['version']) for role in ('contributor', 'monitor')]
        codes = sorted(f.result().status_code for f in results)
    assert codes == [200, 409]


def test_decline_requires_reason_and_keeps_case_usable():  # D04
    task = new_task()
    version = assign(task, 'monitor').json()['data']['version']
    assert transition(task['id'], 'monitor', 'decline', version).status_code == 422
    r = transition(task['id'], 'monitor', 'decline', version, 'Path flooded, unsafe to reach the bank')
    assert r.json()['data']['state'] == 'declined'
    assert client.get(f"/api/v1/orgs/{ORG}/cases/{case_id(CASE)}", headers=as_('coordinator')).status_code == 200


def test_replicates_are_individual_and_idempotent():  # D08 D09 H02
    task = accepted_task()
    key = str(uuid4())
    body = [rep('452'), rep('455', minutes=1), rep('451', minutes=2)]
    r = readings(task, body, client_id=key)
    assert r.status_code == 201, r.text
    data = r.json()['data']
    assert data['state'] == 'received_pending_qc' and len(data['readings']) == 3
    assert all(x['eligible'] for x in data['readings'])
    assert readings(task, body, client_id=key).json()['data'] == data  # duplicate offline sync -> original response
    detail = client.get(f"/api/v1/orgs/{ORG}/tasks/{task['id']}", headers=as_('monitor')).json()['data']
    assert len({x['visit_id'] for x in detail['readings']}) == 1 and len(detail['readings']) == 3
    assert detail['state'] == 'submitted'


def test_missing_metadata_meter_sc25_and_calibration_are_history_only():  # D06 D07 D10 D12
    task = accepted_task()
    r = readings(task, [rep(temperature=None)])
    assert 'water temperature missing: history only' in r.json()['data']['readings'][0]['reasons']
    task = accepted_task()
    r = readings(task, [rep()], mode='meter_sc25')
    assert any('meter SC25' in x for x in r.json()['data']['readings'][0]['reasons'])
    task = accepted_task()
    r = readings(task, [rep(measured_at='2025-12-15T09:00:00+00:00')])  # qualified then, but no passing calibration yet
    assert any('instrument verification not valid' in x for x in r.json()['data']['readings'][0]['reasons'])
    task = accepted_task()
    r = readings(task, [rep()], version=task['version'] - 1)  # captured offline under the earlier task version
    assert r.status_code == 201 and any('task revised after capture' in x for x in r.json()['data']['readings'][0]['reasons'])
    assert readings(accepted_task(), [rep(measured_at=(NOW + timedelta(days=2)).isoformat())]).status_code == 422
    reading_id = r.json()['data']['readings'][0]['id']
    q = client.post(f'/api/v1/orgs/{ORG}/readings/{reading_id}/quality', headers=as_('expert'),
                    json={'disposition': 'accepted', 'reason': 'Trying to accept a history-only record'})
    assert q.status_code == 422  # history-only cannot be accepted for assessment


def test_qualification_is_checked_at_measurement_time():  # D05
    task = accepted_task()
    r = readings(task, [rep(measured_at='2024-06-01T00:00:00+00:00')])  # before the qualification was valid
    assert r.status_code == 403


def test_quality_decisions_respect_capabilities():
    task = accepted_task()
    rid = readings(task, [rep()]).json()['data']['readings'][0]['id']
    url = f'/api/v1/orgs/{ORG}/readings/{rid}/quality'
    assert client.post(url, headers=as_('admin'), json={'disposition': 'accepted', 'reason': 'Admin cannot accept evidence'}).status_code == 403
    assert client.post(url, headers=as_('coordinator'), json={'disposition': 'accepted', 'reason': 'Coordinator cannot accept either'}).status_code == 403
    assert client.post(url, headers=as_('coordinator'), json={'disposition': 'suspect', 'reason': 'Display flickered during reading'}).status_code == 200
    r = client.post(url, headers=as_('expert'), json={'disposition': 'accepted', 'reason': 'Reviewed replicate record', 'comparable': True})
    assert r.status_code == 200


def test_access_closure_blocks_tasks_and_assignment():  # D13
    code = 'B3'
    task = new_task(code=code)
    version = assign(task, 'monitor').json()['data']['version']
    r = client.post(f'/api/v1/orgs/{ORG}/stations/{station(code)}/access', headers=as_('contributor'),
                    json={'status': 'closed', 'notes': 'Footpath fenced off for works'})
    assert r.status_code == 200 and r.json()['data']['blocked_tasks'] >= 1
    detail = client.get(f"/api/v1/orgs/{ORG}/tasks/{task['id']}", headers=as_('coordinator')).json()['data']
    assert detail['state'] == 'blocked' and version < detail['version']
    fresh = new_task(code=code)
    assert assign(fresh, 'monitor').json()['error']['code'] == 'READINESS_REQUIRED'
    assert client.post(f'/api/v1/orgs/{ORG}/stations/{station(code)}/access', headers=as_('contributor'),
                       json={'status': 'open', 'notes': 'Looks open again'}).status_code == 403  # only coordinators resolve
    assert client.post(f'/api/v1/orgs/{ORG}/stations/{station(code)}/access', headers=as_('coordinator'),
                       json={'status': 'open', 'notes': 'Coordinator confirmed path reopened'}).status_code == 200


def test_conductivity_modes_are_explicit_and_units_round_trip():  # D06
    from decimal import Decimal
    from services.worker.snapshot import to_us_cm
    for value in ('1.4135', '0.00045', '12', '0.1'):
        assert Decimal(to_us_cm(value, 'mS/cm')) / 1000 == Decimal(value)  # exact, no binary rounding
    assert to_us_cm('452', 'uS/cm') == '452'
    task = accepted_task()
    r = readings(task, [rep()], mode='true_sc25_enclosure')  # an enclosure is a reviewed construct, not a field entry
    assert r.status_code == 422
    raw = readings(accepted_task(), [rep('1.4135')], unit='mS/cm').json()['data']['readings'][0]
    detail = client.get(f"/api/v1/orgs/{ORG}/tasks/{task['id']}", headers=as_('monitor'))
    assert raw['eligible'] and detail.status_code == 200


def test_calibration_events_are_append_only_and_expert_recorded():  # D09 support
    meter = sid('instrument:SC-014')
    body = {'status': 'pass', 'effective_from': '2026-09-01T00:00:00+00:00', 'effective_until': '2027-09-01T00:00:00+00:00',
            'checked_at': NOW.isoformat(), 'reason': 'Example verification against a standard'}
    url = f'/api/v1/orgs/{ORG}/instruments/{meter}/calibrations'
    assert client.post(url, json=body, headers=as_('coordinator')).status_code == 403
    assert client.post(url, json=body | {'reason': 'short'}, headers=as_('expert')).status_code == 422
    assert client.post(url, json=body | {'bounds': {'gain': synthetic('0', '1', '1')}}, headers=as_('expert')).status_code == 422
    r = client.post(url, json=body, headers=as_('expert'))
    assert r.status_code == 201, r.text
    items = client.get(f'/api/v1/orgs/{ORG}/instruments', headers=as_('expert')).json()['data']
    history = next(i for i in items if i['id'] == meter)['calibrations']
    assert len(history) >= 2 and any(c['id'] == r.json()['data']['id'] for c in history)


def test_reading_stays_valid_after_calibration_expires():  # D09
    task = accepted_task()
    rid = readings(task, [rep()]).json()['data']['readings'][0]['id']
    # a later event whose window ended does not touch the stored calibration of the earlier reading
    body = {'status': 'pass', 'effective_from': '2026-01-01T00:00:00+00:00', 'effective_until': (NOW - timedelta(minutes=5)).isoformat(),
            'checked_at': NOW.isoformat(), 'reason': 'Example: certificate period that ended after the reading',
            'bounds': {'gain': synthetic('.99', '1.01', '1'), 'offset': synthetic('-1', '1', 'uS/cm'),
                       'temperature_bias': synthetic('-.1', '.1', 'degC'), 'accounting': 'decomposed'}}
    assert client.post(f"/api/v1/orgs/{ORG}/instruments/{sid('instrument:SC-009')}/calibrations", json=body, headers=as_('expert')).status_code == 201
    detail = client.get(f"/api/v1/orgs/{ORG}/tasks/{task['id']}", headers=as_('monitor')).json()['data']
    assert next(x for x in detail['readings'] if x['id'] == rid)['eligible']
    q = client.post(f'/api/v1/orgs/{ORG}/readings/{rid}/quality', headers=as_('expert'),
                    json={'disposition': 'accepted', 'reason': 'Valid calibration at measurement time'})
    assert q.status_code == 200
