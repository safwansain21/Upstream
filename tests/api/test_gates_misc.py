"""Smaller release gates checked against the running API and engine: B14, E14, E22, E27, G08, A02."""
import io
import json
import re
from uuid import uuid4

from PIL import Image

from services.api.config import settings
from services.api.db import transaction
from services.worker.snapshot import build
from tests.api.test_analysis import case_id
from tests.api.test_http import ORG, as_, client, report
from tests.api.test_mapping import draft, fresh_case, line
from tests.api.test_review import compute, scenario

# Claims, not disclaimers: "bounds are not probabilities" is fine; "probability of a source", "82%" or "health score" are not.
FORBIDDEN_CLAIMS = re.compile(r'probability (?:of|that)|likelihood (?:of|that)|health score|pollution probability|confidence (?:score|level)|\b\d{1,3}(?:\.\d+)?\s?%', re.I)


def test_visibility_choice_never_exposes_other_records():  # B14
    r = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(public_visibility=True), headers=as_('reporter') | {'Idempotency-Key': str(uuid4())}).json()['data']
    default = client.post(f'/api/v1/orgs/{ORG}/reports', json=report(), headers=as_('reporter') | {'Idempotency-Key': str(uuid4())}).json()['data']
    assert client.get(f"/api/v1/orgs/{ORG}/reports/{default['id']}", headers=as_('reporter')).json()['data']['public_visibility'] is False
    # Making one report public exposes neither the case record nor other reports to another member or the public.
    assert client.get(f"/api/v1/orgs/{ORG}/cases/{r['case_id']}", headers=as_('contributor')).status_code == 404
    assert client.get(f"/api/v1/orgs/{ORG}/reports/{r['id']}", headers=as_('contributor')).status_code == 404
    assert client.get(f"/api/v1/orgs/{ORG}/cases/{r['case_id']}/readings", headers=as_('contributor')).json()['data'] == []


def test_no_fitted_probability_or_health_score_in_results():  # E14
    case = scenario()
    a = compute(case)
    text = json.dumps({k: v for k, v in a.items() if k not in ('id', 'snapshot_hash', 'created_at')})
    assert not FORBIDDEN_CLAIMS.search(text), FORBIDDEN_CLAIMS.search(text)
    example = client.get('/api/v1/examples/useful-evidence').text
    assert not FORBIDDEN_CLAIMS.search(example)


def test_context_layers_do_not_change_compatibility_inputs():  # E22 (and F11 routing-only principle)
    case = case_id('Mill Brook')
    with transaction(worker=True) as db:
        before = build(db, ORG, case)[0]
        db.execute('''insert into context_features(org_id,case_id,kind,source,license,sensitive,data_origin)
            values(%s,%s,'animal_access','Example cattle access (synthetic)','CC0-1.0',true,'synthetic'),
                  (%s,%s,'public_access','Example footpath (synthetic)','CC0-1.0',false,'synthetic')''', (ORG, case, ORG, case))
        after = build(db, ORG, case)[0]
    assert after == before  # the engine snapshot has no context fields at all
    with transaction(worker=True) as db:  # leave no test context rows behind
        db.execute("delete from context_features where case_id=%s and source like 'Example %%(synthetic)'", (case,))


def test_real_organizations_get_no_synthetic_protocol_bounds():  # E27
    from scripts.seed_example import guard  # the example seed refuses production/non-example targets
    with transaction(worker=True) as db:
        real = db.execute('select id from organizations where not example').fetchall()
        synthetic_in_real = db.execute('''select count(*) n from protocol_versions p join organizations o on o.id=p.org_id
            where not o.example and (p.data_origin='synthetic' or p.configuration::text like '%%synthetic%%')''').fetchone()['n']
        synthetic_bg = db.execute('''select count(*) n from background_versions b join organizations o on o.id=b.org_id where not o.example and b.data_origin='synthetic' ''').fetchone()['n']
    assert synthetic_in_real == 0 and synthetic_bg == 0
    assert callable(guard) and real is not None


def test_oversize_media_and_imports_are_rejected():  # G08 (oversize import and oversize media)
    big = io.BytesIO()
    Image.effect_noise((2600, 2600), 100).convert('RGB').save(big, 'PNG')
    data = big.getvalue() + b'\0' * max(0, 15 * 1024 * 1024 + 1 - len(big.getvalue()))
    r = client.post(f'/api/v1/orgs/{ORG}/uploads', files={'file': ('big.png', data, 'image/png')}, headers=as_('reporter'))
    assert r.status_code == 422 and '15 MB' in r.json()['error']['message']
    many = [line(f'R{i}', (i * 1e-5, 0), (i * 1e-5, 1e-5)) for i in range(10001)]
    r = draft(fresh_case()['case_id'], many)
    assert r.status_code in (413, 422), r.text[:200]


def test_core_workflow_runs_without_paid_providers():  # A02
    cfg = settings()
    assert not cfg.ai_api_key  # AI unavailable, not simulated
    status = client.get('/api/v1/status').json()['data']
    assert status['ai'] == 'unavailable' and status['email'] == 'local_mail_catcher'
    import os
    assert not os.getenv('MAP_STYLE_URL')  # maps draw Upstream data on a plain background
