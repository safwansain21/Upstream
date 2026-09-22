"""E08: 105/23 threshold; equality is ambiguous; the exact planner flips on either side of it."""
from fractions import Fraction as F

from fixtures.networks import b2_action, network1_snapshot
from upstream_engine import plan
from upstream_engine.oracle import discrimination_threshold

LOAD_MIN, Q_MAX, BACKGROUND = F('9.52'), F('.161'), (F(405), F(455))


def separated(u):
    """Upper-B source forces B2 >= bg_lo + L_min/q_max - U; others allow B2 <= bg_hi + U. Separation needs a strict gap."""
    return BACKGROUND[0] + LOAD_MIN / Q_MAX - u > BACKGROUND[1] + u


def test_threshold_equality_is_ambiguous():
    t = discrimination_threshold(LOAD_MIN, Q_MAX, BACKGROUND[1] - BACKGROUND[0])
    assert t == F(105, 23)
    assert not separated(t)                 # equality: one outcome fits both explanations
    assert separated(t - F(1, 10**6)) and not separated(t + F(1, 10**6))
    assert not separated(F(5))              # U=5 cannot promise one-step narrowing


def test_exact_planner_matches_threshold_on_both_sides():
    snapshot = network1_snapshot()
    below = plan(snapshot, b2_action('4.56'))   # 4.56 < 105/23 = 4.5652...
    above = plan(snapshot, b2_action('4.57'))
    assert below.completed and F(below.conservative_bound_m) < 5300
    assert above.completed and F(above.conservative_bound_m) == 5300
