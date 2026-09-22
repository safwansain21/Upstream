"""C06 (subdivision/station insertion), E20 (unresolved never dropped to match a prediction), E26 (stated limits, no detection claim)."""
from fractions import Fraction as F

from fixtures.networks import b2_action, direct_reading, network1_snapshot
from upstream_engine import Reach, assess, classify_network, plan, split_reach


def subdivide(network, reach_id):
    """Split one reach into two rows at an intermediate node WITHOUT adding a station."""
    r = next(x for x in network.reaches if x.id == reach_id)
    half = F(r.length_m) / 2
    mid = f'{r.id}:mid'
    parts = (Reach(id=r.id + ':a', upstream=r.upstream, downstream=mid, length_m=str(float(half)), geometry_id=r.geometry_id + ':a',
                   direction_verified=True, source=r.source),
             Reach(id=r.id + ':b', upstream=mid, downstream=r.downstream, length_m=str(float(F(r.length_m) - half)), geometry_id=r.geometry_id + ':b',
                   direction_verified=True, source=r.source))
    return network.model_copy(update={'reaches': tuple(x for x in network.reaches if x.id != reach_id) + parts})


def test_row_subdivision_alone_preserves_results():  # C06
    snapshot = network1_snapshot()
    split = snapshot.model_copy(update={'network': subdivide(snapshot.network, 'B1-B2')})
    before, after = assess(snapshot), assess(split)
    assert F(before.retained_length_m) == F(after.retained_length_m) == 5300
    assert len(before.classes) == len(after.classes)
    assert sorted(F(c.length_m) for c in before.classes) == sorted(F(c.length_m) for c in after.classes)
    assert plan(snapshot, b2_action()).conservative_bound_m == plan(split, b2_action()).conservative_bound_m


def test_station_insertion_splits_reach_and_recomputes_signatures():  # C06
    net = network1_snapshot().network
    base = classify_network(net)
    inserted = split_reach(net, 'B1-B2', 'B15', '400')
    after = classify_network(inserted)
    assert F(after.total_length_m) == F(base.total_length_m) == 8500  # channel length preserved
    assert len(after.classes) == len(base.classes) + 1                # a new station creates a new distinguishable class
    assert not inserted.reviewed                                        # a changed network needs review again
    assert any(c.signature and 'B15' in c.signature for c in after.classes)


def test_unresolved_results_are_never_dropped_to_match_a_prediction():  # E20
    snapshot = network1_snapshot()
    predicted = plan(snapshot, b2_action('4'))          # the planner predicted narrowing is possible
    assert F(predicted.conservative_bound_m) < 5300
    b2 = direct_reading('B2', '600', id='observed-B2', minute=6)
    observed = snapshot.model_copy(update={'readings': snapshot.readings + (b2,)})
    limited = assess(observed, timeout_ms=0)            # the later solve cannot finish
    assert all(c.status in ('compatible', 'unresolved') for c in limited.classes)
    assert F(limited.retained_length_m) >= F(assess(snapshot).retained_length_m)  # nothing removed to meet the prediction
    assert limited.computation_incomplete


def test_multi_source_case_states_limits_without_detection_claims():  # E26
    snapshot = network1_snapshot()
    # Two simultaneous inputs (A-side and B-side) violate the one-input model; B2 raised as well.
    readings = snapshot.readings + (direct_reading('B2', '520', id='two-source-B2', minute=6),)
    result = assess(snapshot.model_copy(update={'readings': readings}))
    text = ' '.join(result.assumptions)
    assert 'Multi-source, transient, biased, or misconnected scenarios may escape model-conflict detection' in text
    assert 'detected' not in text.lower().replace('detection', '')
    assert result.model_conflict or F(result.retained_length_m) >= 0  # whatever the outcome, no guaranteed detection is claimed
