"""F11: context layers influence only attention and recipient suggestions, always with their source, never with a health claim."""
from uuid import uuid4

from services.api.db import transaction
from services.worker.snapshot import build
from tests.api.test_gates_misc import FORBIDDEN_CLAIMS
from tests.api.test_http import ORG, as_, client
from tests.api.test_review import compute, scenario

HEALTH = r'safe to swim|unsafe|health risk|illness|disease|toxic|harmful to health|poison'


def add_layers(case):
    with transaction(worker=True) as db:
        db.execute('''insert into context_features(org_id,case_id,kind,source,license,sensitive,data_origin)
            values(%s,%s,'animal_access','Example cattle drinking point (synthetic)','CC0-1.0',true,'synthetic'),
                  (%s,%s,'habitat','Example otter holt register (synthetic)','CC0-1.0',true,'synthetic')''', (ORG, case, ORG, case))


def recipient(name, concerns):
    r = client.post(f'/api/v1/orgs/{ORG}/recipients', json={'name': name, 'concerns': concerns}, headers=as_('admin'))
    assert r.status_code == 201, r.text
    return r.json()['data']


def test_context_suggests_recipients_and_attention_with_sources_only():  # F11
    import re
    case = scenario()
    first = compute(case)
    tag = uuid4().hex[:6]
    farm = recipient(f'Farm liaison {tag}', ['animal_access'])
    parks = recipient(f'Parks team {tag}', ['public_access'])
    assert farm['concerns'] == ['animal_access']
    empty = client.get(f'/api/v1/orgs/{ORG}/cases/{case}/context', headers=as_('expert')).json()['data']
    assert empty['layers'] == [] and empty['attention'] == {'level': 'routine', 'because': []}
    assert not any(s['name'].endswith(tag) for s in empty['suggestions'])

    with transaction(worker=True) as db:
        before = build(db, ORG, case)[0]
    add_layers(case)
    with transaction(worker=True) as db:
        assert build(db, ORG, case)[0] == before  # compatibility inputs are unchanged
    body = client.get(f'/api/v1/orgs/{ORG}/cases/{case}/context', headers=as_('expert'))
    ctx = body.json()['data']
    assert {layer['kind'] for layer in ctx['layers']} == {'animal_access', 'habitat'}
    assert ctx['attention']['level'] == 'elevated'
    assert ctx['attention']['because'] == [{'kind': 'animal_access', 'source': 'Example cattle drinking point (synthetic)', 'data_origin': 'synthetic'}]
    mine = {s['name']: s for s in ctx['suggestions'] if s['name'].endswith(tag)}
    assert set(mine) == {farm['name']}  # only recipients configured for a present layer; parks has no public-access layer here
    assert mine[farm['name']]['because'][0]['source'] == 'Example cattle drinking point (synthetic)'
    assert all(c['source'] for s in ctx['suggestions'] for c in s['because'])
    assert 'do not establish any health outcome' in ctx['statement']
    assert not FORBIDDEN_CLAIMS.search(body.text) and not re.search(HEALTH, body.text, re.I)
    again = compute(case)  # the assessment is reused: context does not alter the engine result
    assert again['id'] == first['id'] and again['retained_length_m'] == first['retained_length_m']
    assert client.get(f'/api/v1/orgs/{ORG}/cases/{case}/context', headers=as_('contributor')).status_code in (403, 404)
    assert parks['concerns'] == ['public_access']


def test_recipient_concerns_are_a_closed_list():  # F11
    r = client.post(f'/api/v1/orgs/{ORG}/recipients', json={'name': 'Clinic', 'concerns': ['health']}, headers=as_('admin'))
    assert r.status_code == 422
