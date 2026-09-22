"""Local mapping: GeoJSON import, draft edits, validation, diff and publication (group C)."""
from decimal import Decimal
from uuid import uuid4

from services.worker.__main__ import work_once
from tests.api.test_analysis import case_id
from tests.api.test_http import ORG, as_, client, report

LON, LAT = -2.60, 51.46  # synthetic placement only


def line(code, *pts):
    return {'type': 'Feature', 'properties': {'id': code}, 'geometry': {'type': 'LineString', 'coordinates': [[LON + x, LAT + y] for x, y in pts]}}


def station_pt(code, x, y):
    return {'type': 'Feature', 'properties': {'station': code}, 'geometry': {'type': 'Point', 'coordinates': [LON + x, LAT + y]}}


Y = [line('A', (-.004, .01), (0, .005)), line('B', (.004, .01), (0, .005)), line('C', (0, .005), (0, 0))]
CROSSING = line('X', (-.002, .002), (.002, .002))  # crosses C with no shared vertex


def fresh_case():
    """A new unmapped case per test so drafts/publications never collide between runs."""
    r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(local_name=f'Test ditch {uuid4().hex[:6]}', unmapped=True),
                    headers=as_('reporter') | {'Idempotency-Key': str(uuid4())})
    assert r.status_code == 201, r.text
    return r.json()['data']


def draft(case, features, **extra):
    return client.post(f'/api/v1/orgs/{ORG}/cases/{case}/network/drafts', headers=as_('coordinator'),
                       json={'source': 'Example community trace (synthetic)', 'license': 'CC-BY-4.0',
                             'geojson': {'type': 'FeatureCollection', 'features': features}} | extra)


def version(nid, role='coordinator'):
    return client.get(f'/api/v1/orgs/{ORG}/networks/{nid}', headers=as_(role)).json()['data']


def test_import_preserves_provenance_defaults_unverified_and_crossing_is_not_confluence():  # C01 C04 C02
    case = fresh_case()['case_id']
    r = draft(case, Y + [CROSSING])
    assert r.status_code == 201, r.text
    assert any('X' in w and 'not treated as a confluence' for w in r.json()['data']['warnings'])
    v = version(r.json()['data']['id'])
    assert v['source'] == 'Example community trace (synthetic)' and v['license'] == 'CC-BY-4.0' and v['status'] == 'proposed'
    assert all(e['flow_status'] == 'unknown' and e['connectivity'] == 'mapped_unverified' for e in v['edges'])
    x = next(e for e in v['edges'] if e['code'] == 'X')
    c = next(e for e in v['edges'] if e['code'] == 'C')
    assert {x['from_code'], x['to_code']}.isdisjoint({c['from_code'], c['to_code']})  # no junction invented at the crossing
    assert any('mapping_incomplete' in reason for reason in v['validation'])
    # A draft cannot drive the case's analysis before review (C02).
    ready = client.get(f'/api/v1/orgs/{ORG}/cases/{case}/readiness', headers=as_('coordinator')).json()['data']
    assert 'mapping_incomplete: no local network version recorded' in ready['reasons']


def test_station_splits_reach_without_snapping_and_preserves_length():  # C06 C12
    case = fresh_case()['case_id']
    nid = draft(case, Y).json()['data']['id']
    before = sum(Decimal(e['length_m']) for e in version(nid)['edges'])
    r = client.post(f'/api/v1/orgs/{ORG}/networks/{nid}/stations', json={'code': 'S1', 'lon': LON, 'lat': LAT + .0025}, headers=as_('coordinator'))
    assert r.status_code == 201, r.text
    v = version(nid)
    assert sum(Decimal(e['length_m']) for e in v['edges']) == before
    assert {e['code'] for e in v['edges']} >= {'C:up', 'C:down'} and 'C' not in {e['code'] for e in v['edges']}
    far = client.post(f'/api/v1/orgs/{ORG}/networks/{nid}/stations', json={'code': 'S2', 'lon': LON + .01, 'lat': LAT + .01}, headers=as_('coordinator'))
    assert far.status_code == 422 and 'not moved automatically' in far.json()['error']['message']


def test_culvert_and_split_topology_block_localization_but_case_stays_usable():  # C03 C05
    case = fresh_case()['case_id']
    split = [line('P', (0, .01), (0, .006)), line('Q', (0, .006), (-.002, .003)), line('R', (0, .006), (.002, .003))]
    nid = draft(case, split).json()['data']['id']
    assert any('directed split' in r for r in version(nid)['validation'])
    edge = version(nid)['edges'][0]
    assert client.patch(f"/api/v1/orgs/{ORG}/networks/{nid}/edges/{edge['id']}", json={'culvert': True}, headers=as_('coordinator')).status_code == 200
    assert next(e for e in version(nid)['edges'] if e['id'] == edge['id'])['connectivity'] == 'unknown_connection'
    assert client.get(f'/api/v1/orgs/{ORG}/cases/{case}', headers=as_('coordinator')).status_code == 200


def test_publication_requires_verifier_evidence_and_freezes_version():  # C07 C10
    case = fresh_case()['case_id']
    nid = draft(case, Y).json()['data']['id']
    body = {'reason': 'Walked all reaches with the local group', 'evidence': ['field-walk-2026-09'], 'boundary': 'open', 'mixing_reviewed': False}
    assert client.post(f'/api/v1/orgs/{ORG}/networks/{nid}/publish', json=body, headers=as_('expert')).status_code == 403
    assert client.post(f'/api/v1/orgs/{ORG}/networks/{nid}/publish', json=body | {'evidence': []}, headers=as_('coordinator')).status_code == 422
    r = client.post(f'/api/v1/orgs/{ORG}/networks/{nid}/publish', json=body, headers=as_('coordinator'))
    assert r.status_code == 200, r.text
    v = version(nid)
    assert v['status'] == 'reviewed' and v['review_reason'] == body['reason'] and v['evidence_refs'] == body['evidence']
    assert v['boundary_treatment'] == 'open'  # unknown upstream inflow stays explicit
    edge = v['edges'][0]['id']
    assert client.patch(f'/api/v1/orgs/{ORG}/networks/{nid}/edges/{edge}', json={'flow_status': 'verified'}, headers=as_('coordinator')).status_code == 409
    assert client.get(f'/api/v1/orgs/{ORG}/cases/{case}', headers=as_('coordinator')).json()['data']['network_id'] == nid


def test_new_network_version_keeps_old_assessment_dependencies():  # C07
    mill = case_id('Mill Brook')

    def assess():
        job = client.post(f'/api/v1/orgs/{ORG}/cases/{mill}/analyses', headers=as_('coordinator')).json()['data']
        while client.get(f"/api/v1/orgs/{ORG}/analyses/{job['id']}", headers=as_('coordinator')).json()['data']['state'] != 'done':
            assert work_once()
        return client.get(f'/api/v1/orgs/{ORG}/cases/{mill}/assessment', headers=as_('expert')).json()['data']

    old = assess()
    old_network = next(d['entity_id'] for d in old['dependencies'] if d['entity_type'] == 'network_version')
    nid = client.post(f'/api/v1/orgs/{ORG}/cases/{mill}/network/drafts', json={}, headers=as_('coordinator')).json()['data']['id']
    assert version(nid)['diff']['added'] == [] and version(nid)['diff']['removed'] == []
    r = client.post(f'/api/v1/orgs/{ORG}/networks/{nid}/publish', headers=as_('coordinator'),
                    json={'reason': 'Re-verified synthetic fixture topology', 'evidence': ['SCIENTIFIC-ENGINE.md 9.1'], 'boundary': 'closed',
                          'mixing_reviewed': True, 'domain_note': 'Synthetic closed domain'})
    assert r.status_code == 200, r.text
    new = assess()
    assert Decimal(new['retained_length_m']) == Decimal('5300') and new['revision'] > old['revision']
    assert next(d['entity_id'] for d in new['dependencies'] if d['entity_type'] == 'network_version') == nid
    again = client.get(f"/api/v1/orgs/{ORG}/cases/{mill}/assessment?revision={old['revision']}", headers=as_('expert')).json()['data']
    assert next(d['entity_id'] for d in again['dependencies'] if d['entity_type'] == 'network_version') == old_network


def test_waterway_external_id_does_not_change_report_ids():  # C08
    created = fresh_case()
    case = client.get(f"/api/v1/orgs/{ORG}/cases/{created['case_id']}", headers=as_('coordinator')).json()['data']
    ww = case['waterway']
    assert ww['provisional']
    r = client.patch(f"/api/v1/orgs/{ORG}/waterways/{ww['id']}", json={'external_ids': {'hydrorivers': '20000001'}}, headers=as_('coordinator'))
    assert r.status_code == 200 and not r.json()['data']['provisional']
    after = client.get(f"/api/v1/orgs/{ORG}/cases/{created['case_id']}", headers=as_('coordinator')).json()['data']
    assert [x['id'] for x in after['reports']] == [created['id']] and after['waterway']['external_ids'] == {'hydrorivers': '20000001'}
