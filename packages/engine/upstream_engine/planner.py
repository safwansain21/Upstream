from fractions import Fraction as F
from itertools import combinations
import time
import z3

from .contracts import Action, Snapshot, PlanResult
from .solver import assess
from .model import build_model, rational, scope
from .graph import exact_text


def _action_reasons(snapshot, action):
    checks = ('approved_station', 'qualified_participant', 'verified_instrument', 'permissible_access', 'timing_comparable')
    reasons = [name for name in checks if not getattr(action, name)]
    approved = {s.id for s in snapshot.network.stations if s.approved}
    if not action.readings:
        reasons.append('no proposed readings')
    if len({(f.reading.id, f.reading.version) for f in action.readings}) != len(action.readings):
        reasons.append('duplicate future reading IDs')
    existing = {(r.id, r.version) for r in snapshot.readings}
    if any((f.reading.id, f.reading.version) in existing for f in action.readings):
        reasons.append('future reading collides with existing evidence')
    if any(f.reading.station_id not in approved for f in action.readings):
        reasons.append('station not approved')
    from .readiness import readiness_reasons
    future_snapshot = snapshot.model_copy(update={'readings':snapshot.readings+tuple(f.reading for f in action.readings)})
    reasons.extend(readiness_reasons(future_snapshot))
    return reasons


def plan(snapshot: Snapshot, action: Action, *, timeout_ms=5000, resource_limit=None, assessment=None) -> PlanResult:
    snapshot = Snapshot.model_validate(snapshot.model_dump(mode='json'))
    action = Action.model_validate(action.model_dump(mode='json'))
    assessment = assessment or assess(snapshot)
    if assessment.snapshot_hash != __import__('upstream_engine.canonical', fromlist=['canonical_hash']).canonical_hash(snapshot):
        raise ValueError('Assessment dependency mismatch')
    retained = [c for c in assessment.classes if c.status != 'incompatible']
    total = sum((F(c.length_m) for c in retained), F())
    base = dict(action_id=action.id, retained_length_m=exact_text(total))
    if assessment.outside_domain_unresolved:
        return PlanResult(**base, conservative_bound_m=None, completed=False, reason='Outside-domain source extent unresolved; no finite whole-source-area guarantee')
    reasons = _action_reasons(snapshot, action)
    if not assessment.eligible or reasons or not retained:
        return PlanResult(**base, conservative_bound_m=None, completed=False, reason='Readiness/operational prerequisites: ' + '; '.join((*assessment.readiness_reasons, *reasons)))
    if len(retained) > 16:
        return PlanResult(**base, conservative_bound_m=exact_text(total), completed=False, reason='More than 16 classes: conservative unscored total; no candidate truncation')
    if timeout_ms <= 0:
        return PlanResult(**base, conservative_bound_m=exact_text(total), completed=False, reason='Computation limit before subset search')
    deadline = time.monotonic() + min(timeout_ms, 30000)/1000
    try:
        graphs = {c.id: build_model(snapshot, c.signature, action, relaxed=True, prefix=c.id + ':') for c in retained}
        weighted = []
        for size in range(1, len(retained) + 1):
            for subset in combinations(retained, size):
                weighted.append((sum((F(c.length_m) for c in subset), F()), tuple(c.id for c in subset)))
        weighted.sort(key=lambda item: (-item[0], item[1]))
        tested = 0
        for weight, ids in weighted:
            remaining = int((deadline - time.monotonic())*1000)
            if remaining <= 0:
                return PlanResult(**base, conservative_bound_m=exact_text(weight), completed=False, tested_subsets=tested, reason='Computation limit; largest not-proven-impossible subset retained')
            solver = z3.SolverFor('QF_LRA')
            solver.set(timeout=remaining, random_seed=0)
            if resource_limit is not None:
                solver.set(rlimit=resource_limit)
            for cid in ids:
                solver.add(*graphs[cid].constraints)
            result = solver.check()
            tested += 1
            if result == z3.sat:
                return PlanResult(**base, conservative_bound_m=exact_text(weight), completed=True, tested_subsets=tested,
                    reason='Highest-weight common-outcome subset in the outer relaxation; all heavier subsets proven impossible')
            if result != z3.unsat:
                return PlanResult(**base, conservative_bound_m=exact_text(weight), completed=False, tested_subsets=tested, reason='Unresolved subset retained: ' + solver.reason_unknown())
        return PlanResult(**base, conservative_bound_m='0', completed=True, tested_subsets=tested, reason='Proposed observation model has no permitted outcome; review action model')
    except (ValueError, KeyError) as exc:
        return PlanResult(**base, conservative_bound_m=None, completed=False, reason=str(exc))
    except (z3.Z3Exception, MemoryError):
        return PlanResult(**base, conservative_bound_m=exact_text(total), completed=False, reason='Solver/resource failure; total retained conservatively')


def witness_oracle(snapshot, action, outcome_vectors, *, timeout_ms=2000):
    """Grid maximum is only a lower bound. UNKNOWN never contributes length."""
    assessment = assess(snapshot)
    retained = [c for c in assessment.classes if c.status != 'incompatible']
    best = F(0)
    for vector in outcome_vectors:
        if len(vector) != len(action.readings):
            raise ValueError('Outcome vector dimension mismatch')
        weight = F(0)
        for c in retained:
            graph = build_model(snapshot, c.signature, action, prefix=c.id + ':')
            solver = graph.solver(timeout_ms=timeout_ms)
            for future, value in zip(action.readings, vector):
                rid = scope(future.reading.id, future.reading.version)
                solver.add(z3.Real('outcome:' + rid) == rational(value))
            if solver.check() == z3.sat:
                model = solver.model()
                if all(z3.is_true(model.eval(constraint, model_completion=True)) for constraint in graph.constraints):
                    weight += F(c.length_m)
        best = max(best, weight)
    return exact_text(best)


def rank_actions(scored):
    """Within 100m of best bound, known participant cost wins, then count/ID."""
    remaining = list(scored)
    ranked = []
    while remaining:
        scored_items = [(a, p) for a, p in remaining if p.conservative_bound_m is not None]
        if not scored_items:
            ranked.extend(sorted(remaining, key=lambda pair: pair[0].id))
            break
        best = min(F(p.conservative_bound_m) for _, p in scored_items)
        tied = [(a, p) for a, p in scored_items if F(p.conservative_bound_m) <= best + 100]
        selected = min(tied, key=lambda pair: (pair[0].travel_task_minutes is None,
            F(pair[0].travel_task_minutes) if pair[0].travel_task_minutes is not None else F(0), len(pair[0].readings), pair[0].id))
        ranked.append(selected)
        remaining.remove(selected)
    return ranked
