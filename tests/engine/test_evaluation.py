"""J05 paired policy comparison and J07 joint metrics (synthetic; see docs/evaluation.md)."""
import pytest
from pydantic import ValidationError

from fixtures import evaluation as ev
from fixtures.networks import network1_snapshot
from upstream_engine import Snapshot


def test_readings_are_paired_exogenous_values():  # J05
    a, b = ev.Truth(3), ev.Truth(3)
    b.reading('A1', 0, 5)  # visiting in another order must not change what a station yields
    assert a.reading('B2', 0, 20) == b.reading('B2', 0, 20)
    assert ev.Truth(3).reading('B2', 0, 20) != ev.Truth(4).reading('B2', 0, 20)


def test_engine_never_receives_truth():  # J05 / engine section 9.4
    data = network1_snapshot().model_dump(mode='json') | {'true_source': 'A1-A2'}
    with pytest.raises(ValidationError):
        Snapshot.model_validate(data)
    with pytest.raises(ValidationError):
        Snapshot.model_validate(network1_snapshot().model_dump(mode='json') | {'load_truth': '12'})


def test_policies_share_inference_stopping_and_report_joint_metrics():  # J05, J07
    results = ev.evaluate(2)
    assert set(results) == {(s, p) for s in ev.SCENARIOS for p in ev.POLICIES}
    for (scenario, _), s in results.items():
        assert s['episodes'] == 2 and s['visits'] <= 2 * ev.BUDGET
        assert s['contained'] + s['incorrect_exclusions'] == 2
        assert {'contained_ci', 'compatible_contained', 'unresolved_episodes', 'mean_retained_m', 'readings', 'volunteer_minutes'} <= set(s)
        if scenario == 'nominal':
            assert s['incorrect_exclusions'] == 0  # truth inside every protocol bound: exact inference never excludes it
    table = ev.markdown(results)
    assert 'Incorrect exclusions' in table and 'Volunteer min' in table and 'biased_background' in table


def test_misspecified_background_can_cause_incorrect_exclusion():  # J07: failures are reported, not hidden
    rows = [ev.run_episode(ev.random_policy, e, 'biased_background') for e in range(10)]
    assert any(r['status'] == 'incompatible' for r in rows)
