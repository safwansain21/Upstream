"""Membership administration: revocation blocks privileged work immediately (G03); no self-upgrade (G06); notifications."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from tests.api.test_analysis import case_id
from tests.api.test_http import ORG, as_, client, fresh_contributor, report, token


def new_member():
    email = fresh_contributor.__wrapped__()
    headers = token(email)
    r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(), headers=headers | {'Idempotency-Key': str(uuid4())})  # joins via intake
    assert r.status_code == 201, r.text
    return client.get('/api/v1/me', headers=headers).json()['data']['user_id'], headers


def task_body():
    start = datetime.now(timezone.utc) + timedelta(days=3)
    return {'case_id': case_id('Harbour channel'), 'task_type': 'location_confirmation', 'purpose': 'Confirm the harbour steps location',
            'window_start': start.isoformat(), 'window_end': (start + timedelta(hours=1)).isoformat()}


def test_revoked_membership_blocks_privileged_operations_immediately():  # G03
    uid, headers = new_member()
    assert client.post(f'/api/v1/orgs/{ORG}/tasks', json=task_body(), headers=headers).status_code == 403
    grant = client.post(f'/api/v1/orgs/{ORG}/members/{uid}/capabilities', headers=as_('admin'),
                        json={'capability': 'coordinate', 'grant': True, 'reason': 'Local group coordinator'})
    assert grant.status_code == 200, grant.text
    assert client.post(f'/api/v1/orgs/{ORG}/tasks', json=task_body(), headers=headers).status_code == 201
    assert client.post(f'/api/v1/orgs/{ORG}/members/{uid}/status', json={'status': 'revoked', 'reason': 'Left the group'}, headers=as_('admin')).status_code == 200
    assert client.post(f'/api/v1/orgs/{ORG}/tasks', json=task_body(), headers=headers).status_code == 403
    again = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(), headers=headers | {'Idempotency-Key': str(uuid4())})
    assert again.status_code == 403  # queued/offline submissions stop too
    assert client.get(f"/api/v1/orgs/{ORG}/cases/{case_id('Mill Brook')}", headers=headers).status_code == 404


def test_capabilities_cannot_be_self_granted_or_granted_by_non_admins():  # G06
    me = client.get('/api/v1/me', headers=as_('admin')).json()['data']['user_id']
    r = client.post(f'/api/v1/orgs/{ORG}/members/{me}/capabilities', headers=as_('admin'), json={'capability': 'expert', 'grant': True, 'reason': 'Self upgrade attempt'})
    assert r.status_code == 403
    coordinator = client.get('/api/v1/me', headers=as_('coordinator')).json()['data']['user_id']
    r = client.post(f'/api/v1/orgs/{ORG}/members/{coordinator}/capabilities', headers=as_('coordinator'), json={'capability': 'admin', 'grant': True, 'reason': 'Escalation attempt'})
    assert r.status_code == 403
    assert client.post(f'/api/v1/orgs/{ORG}/members/{me}/status', headers=as_('admin'), json={'status': 'revoked', 'reason': 'Self'}).status_code == 403


def test_notifications_are_private_and_can_be_marked_read():
    client.post(f'/api/v1/orgs/{ORG}/reports', json=report(), headers=as_('reporter') | {'Idempotency-Key': str(uuid4())})  # receipt notification
    items = client.get(f'/api/v1/orgs/{ORG}/notifications', headers=as_('reporter')).json()['data']
    assert items and all(n['type'] for n in items)
    nid = items[0]['id']
    assert client.post(f'/api/v1/orgs/{ORG}/notifications/{nid}/read', headers=as_('coordinator')).status_code == 404  # not theirs
    assert client.post(f'/api/v1/orgs/{ORG}/notifications/{nid}/read', headers=as_('reporter')).json()['data']['read_at']
    c = client.get(f'/api/v1/orgs/{ORG}/community', headers=as_('contributor')).json()['data']
    assert c['organization']['example'] and 'ranking' not in c
