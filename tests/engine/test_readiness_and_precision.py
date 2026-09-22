from fractions import Fraction as F
from datetime import timedelta
import pytest
from upstream_engine import assess, plan, canonical_hash
from fixtures.networks import network1_snapshot,b2_action,interval

def test_transport_bound_is_computed_from_paths_and_velocity():
    from upstream_engine.transport import travel_enclosures
    s = network1_snapshot()
    bounds = travel_enclosures(s.network,interval('.15','.45','m/s'))
    assert bounds['O'][1] == F(35000)
    underclaimed = s.readiness.model_copy(update={'max_travel_seconds':'10'})
    result = assess(s.model_copy(update={'readiness':underclaimed}))
    assert not result.eligible and F(result.retained_length_m)==8500
    missing = s.readiness.model_copy(update={'velocity':None})
    assert not assess(s.model_copy(update={'readiness':missing})).eligible

def test_future_visit_outside_sustained_evidence_is_unscored():
    s,action = network1_snapshot(),b2_action()
    future = action.readings[0]
    late = future.reading.model_copy(update={'measured_at':future.reading.measured_at+timedelta(days=7)})
    action = action.model_copy(update={'readings':(future.model_copy(update={'reading':late}),)})
    result = plan(s,action)
    assert result.conservative_bound_m is None and not result.completed

def test_precision_diagnostic_returns_bracket_or_honest_unavailable():
    from upstream_engine.diagnostics import precision_bracket
    s = network1_snapshot()
    bracket = precision_bracket(s,b2_action(),lower='0',upper='10',tolerance='.05')
    if bracket.available:
        assert F(bracket.upper)-F(bracket.lower)<=F('.05')
        assert bracket.label == 'Precision bracket for the conservative relaxed model'
    else:
        assert bracket.reason
    exhausted = precision_bracket(s,b2_action(),lower='0',upper='10',tolerance='.05',timeout_ms=0)
    assert not exhausted.available

def test_scientific_dependency_and_protocol_origin_remain_explicit():
    s = network1_snapshot()
    changed = s.model_copy(update={'backgrounds':(s.backgrounds[0].model_copy(update={'version':'2'}),)+s.backgrounds[1:]})
    assert canonical_hash(changed)!=canonical_hash(s)
    assert all(b.enclosure.data_origin=='synthetic' for b in s.backgrounds)
    assert 'universal' not in ' '.join(assess(s).readiness_reasons).lower()
