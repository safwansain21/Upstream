"""Evidence package export, verification, explicit delivery and recipient acknowledgment (group F, J08)."""
import json
from uuid import uuid4

from services.api.config import settings
from tests.api.test_http import ORG, as_, client, wait_job
from tests.api.test_review import approve, compute, readings, scenario
from scripts.seed_example import sid


def approved_case():
    case = scenario()
    a = compute(case)
    assert approve(a['id']).status_code == 200
    return case, a


def export(aid):
    job = client.post(f'/api/v1/orgs/{ORG}/assessments/{aid}/exports', headers=as_('expert'))
    assert job.status_code == 202, job.text
    assert wait_job(job.json()['data']['id'])['state'] == 'done'
    return job.json()['data']['id']


def packages(case):
    return client.get(f'/api/v1/orgs/{ORG}/cases/{case}/packages', headers=as_('expert')).json()['data']


def recipient():
    r = client.post(f'/api/v1/orgs/{ORG}/recipients', json={'name': f'Example recipient {uuid4().hex[:6]} (synthetic)'}, headers=as_('admin'))
    assert r.status_code == 201, r.text
    return r.json()['data']['id']


def test_export_contains_matching_versions_and_verifies():  # F12 F15 F16
    case, a = approved_case()
    assert client.post(f"/api/v1/orgs/{ORG}/assessments/{a['id']}/exports", headers=as_('contributor')).status_code in (403, 404)
    export(a['id'])
    [p] = packages(case)
    assert p['deliveries'] == []  # exporting sends nothing
    assert set(p['artifacts']) >= {'assessment.json', 'observations.json', 'evidence.geojson', 'report.html', 'report.pdf', 'manifest.json', 'manifest.jws'}
    get = lambda name: client.get(f"/api/v1/orgs/{ORG}/packages/{p['id']}/artifacts/{name}", headers=as_('expert'))  # noqa: E731
    assessment, geo, obs = json.loads(get('assessment.json').content), json.loads(get('evidence.geojson').content), json.loads(get('observations.json').content)
    assert assessment['assessment_version'] == geo['assessment_version'] == obs['assessment_version'] == str(a['revision'])
    assert assessment['retained_length_km'] == '2.3' and assessment['data_origin'] == geo['data_origin'] == 'synthetic'
    assert {f['id'] for f in geo['features']} and assessment['problem_hash'] == a['snapshot_hash']
    assert get('report.pdf').content.startswith(b'%PDF-')
    v = client.get(f"/api/v1/orgs/{ORG}/packages/{p['id']}/verify", headers=as_('expert')).json()['data']
    assert v['valid'] and v['signature_status'] == ('verified' if settings().export_signing_private_key else 'unsigned')
    key = client.get('/api/v1/signing-key').json()['data']
    assert key['configured'] == bool(settings().export_signing_private_key)


def test_delivery_acknowledgment_retry_and_scoped_link():  # F07 F08 F09
    case, a = approved_case()
    export(a['id'])
    [p] = packages(case)
    rid = recipient()
    assert client.post(f"/api/v1/orgs/{ORG}/packages/{p['id']}/deliveries", json={'recipient_id': rid}, headers=as_('coordinator')).status_code == 403
    first = client.post(f"/api/v1/orgs/{ORG}/packages/{p['id']}/deliveries", json={'recipient_id': rid}, headers=as_('expert')).json()['data']
    token = first['share_path'].split('/')[-1]
    view = client.get(f'/api/v1/share/{token}').json()['data']
    assert view['banner'] == 'current' and view['delivery']['state'] == 'delivered' and view['delivery']['acknowledged_at'] is None
    assert client.get(f'/api/v1/share/{token}/artifacts/manifest.json').status_code == 200
    assert client.get(f'/api/v1/share/{token}/artifacts/../../secrets').status_code == 404
    assert client.get(f'/api/v1/share/{token[:-2]}xx').status_code == 404  # cannot guess or enumerate other packages
    retry = client.post(f"/api/v1/orgs/{ORG}/packages/{p['id']}/deliveries", json={'recipient_id': rid}, headers=as_('expert')).json()['data']
    assert retry['delivery_id'] == first['delivery_id'] and retry['attempts'] == 2  # same logical delivery, same package bytes
    assert client.get(f'/api/v1/share/{token}').status_code == 404  # earlier link replaced by the retry's link
    token = retry['share_path'].split('/')[-1]
    assert client.post(f'/api/v1/share/{token}/acknowledge', json={'name': 'Example duty officer'}, headers={'Origin': settings().app_url}).status_code == 200
    [p] = packages(case)
    assert p['deliveries'][0]['acknowledged_by'] == 'Example duty officer' and p['deliveries'][0]['state'] == 'delivered'
    assert client.post(f"/api/v1/orgs/{ORG}/packages/{p['id']}/grants/revoke", headers=as_('expert')).json()['data']['revoked'] >= 1
    assert client.get(f'/api/v1/share/{token}').status_code == 404


def test_supersession_sends_distinct_revision_notice_and_keeps_old_bytes():  # F06 F17 J08
    case, a = approved_case()
    export(a['id'])
    [old] = packages(case)
    old_manifest = client.get(f"/api/v1/orgs/{ORG}/packages/{old['id']}/artifacts/manifest.json", headers=as_('expert')).content
    rid = recipient()
    old_token = client.post(f"/api/v1/orgs/{ORG}/packages/{old['id']}/deliveries", json={'recipient_id': rid}, headers=as_('expert')).json()['data']['share_path'].split('/')[-1]
    # Revision: B2 excluded after an instrument failure; recompute, approve, export and send again.
    client.post(f"/api/v1/orgs/{ORG}/instruments/{sid('instrument:SC-014')}/failure", headers=as_('expert'),
                json={'effective_from': '2026-01-01T00:00:00+00:00', 'effective_until': '2026-01-02T00:00:00+00:00', 'reason': 'Verification failed'})
    b2 = next(x for x in readings(case) if x['station_code'] == 'B2')
    client.post(f"/api/v1/orgs/{ORG}/readings/{b2['id']}/quality", headers=as_('expert'), json={'disposition': 'excluded', 'reason': 'Failed verification window'})
    assert client.get(f'/api/v1/share/{old_token}').json()['data']['banner'] == 'under_review'
    b = compute(case)
    assert approve(b['id']).status_code == 200
    export(b['id'])
    new = packages(case)[0]
    assert new['predecessor_id'] == old['id']
    sent = client.post(f"/api/v1/orgs/{ORG}/packages/{new['id']}/deliveries", json={'recipient_id': rid}, headers=as_('expert')).json()['data']
    assert sent['revision_notice_id']
    old_view = client.get(f'/api/v1/share/{old_token}').json()['data']
    assert old_view['banner'] == 'superseded' and old_view['replacement_available']
    token = sent['share_path'].split('/')[-1]
    assert client.get(f'/api/v1/share/{token}').json()['data']['revision_notice']['acknowledged_at'] is None
    client.post(f'/api/v1/share/{token}/acknowledge', json={'name': 'Example duty officer'}, headers={'Origin': settings().app_url})
    new = packages(case)[0]
    assert new['notices'][0]['acknowledged_at'] and new['notices'][0]['acknowledgment_actor'] == 'Example duty officer'
    # The superseded package bytes are unchanged and still verify with their original hash.
    assert client.get(f"/api/v1/orgs/{ORG}/packages/{old['id']}/artifacts/manifest.json", headers=as_('expert')).content == old_manifest
    assert client.get(f"/api/v1/orgs/{ORG}/packages/{old['id']}/verify", headers=as_('expert')).json()['data']['valid']
