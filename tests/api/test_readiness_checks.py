"""C09: readiness reports missing background, calibration, transport and persistence independently of each other."""
import services.api.main as api_main
from services.api.db import transaction
from services.worker.snapshot import build
from tests.api.test_analysis import case_id
from tests.api.test_http import ORG, as_, client


def checks_for(monkeypatch, mutate):
    with transaction(worker=True) as db:
        snapshot, deps, context = build(db, ORG, case_id('Mill Brook'))
    variant = mutate(snapshot)
    monkeypatch.setattr(api_main, 'build_snapshot', lambda db, org, case: (variant, deps, context))
    data = client.get(f"/api/v1/orgs/{ORG}/cases/{case_id('Mill Brook')}/readiness", headers=as_('coordinator')).json()['data']
    return {c['label'] for c in data['checks'] if c['state'] == 'missing'}


def test_each_missing_prerequisite_is_reported_on_its_own(monkeypatch):
    baseline = checks_for(monkeypatch, lambda s: s)
    assert baseline == set()
    no_background = checks_for(monkeypatch, lambda s: s.model_copy(update={'backgrounds': tuple(b for b in s.backgrounds if b.station_id != 'A3')}))
    assert no_background == {'Background ranges for measured stations'}
    no_persistence = checks_for(monkeypatch, lambda s: s.model_copy(update={'readiness': s.readiness.model_copy(update={'persistence_reviewed': False})}))
    assert no_persistence == {'Anchor and persistence'}
    no_transport = checks_for(monkeypatch, lambda s: s.model_copy(update={'readiness': s.readiness.model_copy(update={'velocity': None})}))
    assert no_transport == {'Transport intervals'}
    unreviewed_net = checks_for(monkeypatch, lambda s: s.model_copy(update={'network': s.network.model_copy(update={'reviewed': False})}))
    # travel time genuinely cannot be computed on an unreviewed network, so transport is reported too (a real dependency)
    assert unreviewed_net == {'Local network mapped and reviewed', 'Transport intervals'}
