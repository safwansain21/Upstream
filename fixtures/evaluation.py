"""Synthetic policy evaluation (J05, J07). Knows the true source; the engine never does.

The simulator owns truth (source reach, load, backgrounds, discharges, noise) and turns it into ordinary
true-SC25 enclosure readings. Every policy runs through the same `run_episode`: same engine inference, same
eligibility, same stopping rule, same visit budget. Only the choice of the next station differs.

Paired exogenous values: every random quantity is a hash of (seed, episode, station, visit, kind), never a
draw from a shared stream, so a station visited by two policies yields the identical reading whatever the order.

Results describe this synthetic experiment only. They are not field performance.
Usage: python -m fixtures.evaluation [episodes]
"""
import hashlib
import math
import sys
from fractions import Fraction as F

from upstream_engine import Action, FutureReading, assess, plan, rank_actions
from upstream_engine.graph import exact_text

from .networks import DISCHARGES, direct_reading, interval, network1_snapshot

SEED = 'upstream-eval-1'
BUDGET = 3  # visits after the two outlet anchor readings
MINUTES_PER_VISIT = 25  # synthetic travel+task time per visit
UNCERTAINTY = F(5)  # the fixture's +/-5 uS/cm enclosure half-width
SCENARIOS = {'nominal': None, 'biased_background': 'B2'}  # biased: true B2 background 30 uS/cm above its protocol bound
BACKGROUNDS = {'A3': ('395', '445'), 'O': ('440', '480'), 'B2': ('405', '455')}  # same bounds as network1_snapshot


def uniform(lo, hi, *key):
    """Exogenous value in [lo, hi], a pure function of its key (paired across policies)."""
    h = int(hashlib.sha256(repr((SEED,) + key).encode()).hexdigest()[:12], 16)
    return F(lo) + (F(hi) - F(lo)) * F(h % 10**6, 10**6)


def downstream_nodes(network, node):
    below, seen = {r.upstream: r.downstream for r in network.reaches}, [node]
    while seen[-1] in below:
        seen.append(below[seen[-1]])
    return set(seen)


class Truth:
    def __init__(self, episode, scenario='nominal'):
        self.biased = SCENARIOS[scenario]
        self.base = network1_snapshot()
        reaches = self.base.network.reaches
        self.reach = reaches[int(uniform(0, len(reaches) - F(1, 10**6), episode, 'source'))].id
        self.load = uniform(10, 40, episode, 'load')
        self.episode = episode
        exposed = downstream_nodes(self.base.network, next(r.downstream for r in reaches if r.id == self.reach))
        self.exposed = {s.id for s in self.base.network.stations if s.node in exposed}

    def reading(self, station, visit, minute):
        e = self.episode
        background = uniform(*BACKGROUNDS.get(station, ('400', '450')), e, station, 'background') + (30 if station == self.biased else 0)
        q = F(DISCHARGES[station]) * uniform('.85', '1.15', e, station, visit, 'discharge')
        true = background + (self.load / q if station in self.exposed else 0)
        observed = true + uniform(-UNCERTAINTY * F(98, 100), UNCERTAINTY * F(98, 100), e, station, visit, 'noise')
        observed = F(round(observed * 1000), 1000)  # instrument resolution; rounding stays inside the +/-5 enclosure
        return direct_reading(station, exact_text(observed), exact_text(UNCERTAINTY), id=f'{station}-{visit}', minute=minute)


def future_action(station, step):
    return Action(id=f'visit-{station}', readings=(FutureReading(reading=direct_reading(station, '450', id=f'future-{station}',
        minute=20 + step), uncertainty=interval(exact_text(-UNCERTAINTY), exact_text(UNCERTAINTY))),),
        approved_station=True, qualified_participant=True, verified_instrument=True, permissible_access=True,
        timing_comparable=True, travel_task_minutes=str(MINUTES_PER_VISIT))


# ---- policies: (snapshot, assessment, candidates, episode, step) -> station ----

def planner_policy(snapshot, assessment, candidates, episode, step):
    scored = [(a, plan(snapshot, a, assessment=assessment)) for a in (future_action(s, step) for s in candidates)]
    return rank_actions(scored)[0][0].id.removeprefix('visit-')


def outlet_first_policy(snapshot, assessment, candidates, episode, step):
    """Fixed route: work upstream from the outlet, A branch before B."""
    return next(s for s in ('C', 'A3', 'B3', 'A2', 'B2', 'A1', 'B1') if s in candidates)


def random_policy(snapshot, assessment, candidates, episode, step):
    return min(candidates, key=lambda s: uniform(0, 1, episode, s, step, 'random-policy'))


POLICIES = {'planner': planner_policy, 'outlet_first': outlet_first_policy, 'random': random_policy}


def run_episode(policy, episode, scenario='nominal'):
    """Shared inference, eligibility and stopping for every policy."""
    truth = Truth(episode, scenario)
    readings = [truth.reading('O', 0, 0), truth.reading('O', 1, 10)]
    visited = {'O'}
    for step in range(BUDGET + 1):
        snapshot = truth.base.model_copy(update={'readings': tuple(readings)})
        assessment = assess(snapshot)
        retained = [c for c in assessment.classes if c.status != 'incompatible']
        candidates = sorted(set(DISCHARGES) - visited)
        if step == BUDGET or not assessment.eligible or len(retained) <= 1 or not candidates:
            break
        station = policy(snapshot, assessment, candidates, episode, step)
        readings.append(truth.reading(station, 0, 20 + step))
        visited.add(station)
    true_class = next(c for c in assessment.classes if truth.reach in c.reach_ids)
    return {'episode': episode, 'source': truth.reach, 'status': true_class.status,
            'unresolved': any(c.status == 'unresolved' for c in assessment.classes),
            'conflict': assessment.model_conflict, 'retained_m': F(assessment.retained_length_m),
            'visits': len(visited) - 1, 'readings': len(readings)}


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    centre, half = (p + z * z / (2 * n)) / (1 + z * z / n), z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (max(0.0, centre - half), min(1.0, centre + half))


def summarize(rows):
    n = len(rows)
    contained = sum(r['status'] != 'incompatible' for r in rows)
    return {'episodes': n, 'contained': contained, 'contained_ci': wilson(contained, n),
            'compatible_contained': sum(r['status'] == 'compatible' for r in rows),
            'incorrect_exclusions': n - contained, 'unresolved_episodes': sum(r['unresolved'] for r in rows),
            'model_conflicts': sum(r['conflict'] for r in rows),
            'mean_retained_m': float(sum(r['retained_m'] for r in rows) / n),
            'visits': sum(r['visits'] for r in rows), 'readings': sum(r['readings'] for r in rows),
            'volunteer_minutes': MINUTES_PER_VISIT * sum(r['visits'] for r in rows)}


def evaluate(episodes, scenarios=tuple(SCENARIOS)):
    return {(sc, name): summarize([run_episode(policy, e, sc) for e in range(episodes)]) for sc in scenarios for name, policy in POLICIES.items()}


def markdown(results):
    lines = ['| Scenario | Policy | Contained (incl. unresolved) | 95% Wilson | Exact compatible | Incorrect exclusions | Unresolved episodes | Model conflicts | Mean retained m | Visits | Readings | Volunteer min |',
             '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for (scenario, name), s in results.items():
        lo, hi = s['contained_ci']
        lines.append(f"| {scenario} | {name} | {s['contained']}/{s['episodes']} | {lo:.2f}-{hi:.2f} | {s['compatible_contained']} | {s['incorrect_exclusions']} | "
                     f"{s['unresolved_episodes']} | {s['model_conflicts']} | {s['mean_retained_m']:.0f} | {s['visits']} | {s['readings']} | {s['volunteer_minutes']} |")
    return '\n'.join(lines)


if __name__ == '__main__':
    print(markdown(evaluate(int(sys.argv[1]) if len(sys.argv) > 1 else 60)))
