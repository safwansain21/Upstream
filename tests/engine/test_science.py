from fractions import Fraction as F
import json
import pytest


def test_graph_signatures_and_lengths():
    from fixtures.networks import network1, network2, unsupported_networks
    from upstream_engine import classify_network
    a = classify_network(network1())
    assert a.supported and len(a.classes) == 8
    assert sum(F(c.length_m) for c in a.classes) == 8500
    assert [F(c.length_m) for c in a.classes if c.signature == ('C', 'O')] == [600]
    b = classify_network(network2())
    assert sum(F(c.length_m) for c in b.classes) == 5000
    assert sorted(F(c.length_m) for c in b.classes) == [400, 400, 600, 700, 800, 900, 1200]
    assert all(not classify_network(n).supported for n in unsupported_networks())


def test_independent_fraction_oracle():
    from upstream_engine.oracle import load_enclosure, discrimination_threshold
    assert load_enclosure((F(515), F(525)), (F(440), F(480)), (F('.272'), F('.368'))) == (F('9.52'), F('31.28'))
    assert load_enclosure((F(435), F(445)), (F(395), F(445)), (F('.085'), F('.115')))[1] == F('5.75')
    assert discrimination_threshold(F('9.52'), F('.161'), F(50)) == F(105, 23)


@pytest.mark.parametrize('branch,expected', [(None, 5300), ('high', 2300), ('low', 3000)])
def test_real_solver_canonical_arithmetic(branch, expected):
    from fixtures.networks import network1_snapshot
    from upstream_engine import assess
    result = assess(network1_snapshot(branch))
    assert result.eligible
    assert F(result.retained_length_m) == expected
    assert all(len(c.problem_hash) == 64 and c.problem_smt2 for c in result.classes)
    assert all(c.witness for c in result.classes if c.status == 'compatible')


def test_removing_evidence_restores_candidates():
    from fixtures.networks import network1_snapshot
    from upstream_engine import assess
    s = network1_snapshot('high')
    less = s.model_copy(update={'readings': tuple(r for r in s.readings if r.station_id != 'B2')})
    assert F(assess(less).retained_length_m) == 5300
    only_a = s.model_copy(update={'readings': tuple(r for r in s.readings if r.station_id == 'A3')})
    assert F(assess(only_a).retained_length_m) == 8500


def test_truth_ai_float_and_bad_intervals_rejected():
    from fixtures.networks import network1_snapshot, interval
    from upstream_engine import Snapshot, Interval
    from pydantic import ValidationError
    data = network1_snapshot().model_dump(mode='json')
    for field in ['truth', 'true_source', 'ai_probability', 'context']:
        with pytest.raises(ValidationError):
            Snapshot.model_validate({**data, field: 'forbidden'})
    for lower, upper in [('2', '1'), ('NaN', '4'), (0.1, '4')]:
        with pytest.raises((ValidationError, ValueError)):
            Interval.model_validate({**interval('0', '1', 'm').model_dump(), 'lower': lower, 'upper': upper})


def test_unknown_and_missing_readiness_never_excludes():
    from fixtures.networks import network1_snapshot
    from upstream_engine import assess
    s = network1_snapshot()
    limited = assess(s, resource_limit=1)
    assert F(limited.retained_length_m) == 8500
    assert all(c.status == 'unresolved' for c in limited.classes)
    missing = s.model_copy(update={'readiness': s.readiness.model_copy(update={'persistence_reviewed': False})})
    result = assess(missing)
    assert not result.eligible and F(result.retained_length_m) == 8500


def test_canonical_hash_deduplicates_and_orders_readings():
    from fixtures.networks import network1_snapshot
    from upstream_engine import canonical_hash
    s = network1_snapshot()
    assert canonical_hash(s) == canonical_hash(s.model_copy(update={'readings': tuple(reversed(s.readings)) + (s.readings[0],)}))
    assert canonical_hash(s) != canonical_hash(s.model_copy(update={'protocol_version': '2'}))


def test_planner_ambiguous_outcomes_and_budget_safety():
    from fixtures.networks import network1_snapshot, b2_action
    from upstream_engine import plan
    s = network1_snapshot()
    result = plan(s, b2_action('5'))
    assert result.label == 'Conservative model bound'
    assert F(result.conservative_bound_m) == 5300
    assert result.completed
    assert F(plan(s, b2_action('4'), timeout_ms=0).conservative_bound_m) == 5300
    # Exact disjoint load/reading ranges prove improvement at U=4.
    tighter = plan(s, b2_action('4'))
    assert F(tighter.conservative_bound_m) >= 3000
    assert F(tighter.conservative_bound_m) <= 5300


def test_unknown_connectivity_and_open_boundary_are_explicit():
    from fixtures.networks import network1_snapshot
    from upstream_engine import assess, plan
    from fixtures.networks import b2_action
    s = network1_snapshot()
    unknown = s.network.model_copy(update={'connectivity_verified': False})
    assert F(assess(s.model_copy(update={'network': unknown})).retained_length_m) == 8500
    opened = s.model_copy(update={'network': s.network.model_copy(update={'boundary': 'open'})})
    result = assess(opened)
    assert result.outside_domain_unresolved
    assert plan(opened, b2_action()).conservative_bound_m is None
