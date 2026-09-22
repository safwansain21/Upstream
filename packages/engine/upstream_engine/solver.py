from fractions import Fraction as F
import hashlib
import time
import z3

from .canonical import canonical_bytes
from .contracts import Snapshot, AssessmentResult, ClassResult
from .graph import classify_network, exact_text
from .model import build_model
from .readiness import readiness_reasons

ENGINE_VERSION = '1.0.0'
ASSUMPTIONS = (
    'Conditional compatibility with one nonnegative effective-conductance input; not pollutant identity, responsibility, or water safety.',
    'Reviewed converging non-tidal network; full mixing and sustained comparable event.',
    'Discharge independent per observation is an outer relaxation.',
    'Protocol bounds are not probabilities; empirical backgrounds have no established future coverage.',
    'Multi-source, transient, biased, or misconnected scenarios may escape model-conflict detection.',
)


def assess(snapshot: Snapshot, *, timeout_ms=2000, job_timeout_ms=30000, resource_limit=None) -> AssessmentResult:
    snapshot = Snapshot.model_validate(snapshot.model_dump(mode='json'))
    canonical = canonical_bytes(snapshot)
    snapshot_hash = hashlib.sha256(canonical).hexdigest()
    topology = classify_network(snapshot.network)
    reasons = list(readiness_reasons(snapshot))
    output = []
    deadline = time.monotonic() + min(max(job_timeout_ms, 0), 120000)/1000
    for source in topology.classes:
        problem = ''
        witness = {}
        names = ()
        status, raw_status, reason = 'unresolved', 'unknown', 'computation not completed'
        try:
            graph = build_model(snapshot, source.signature)
            remaining = int((deadline - time.monotonic())*1000)
            solver = graph.solver(timeout_ms=max(1, min(timeout_ms, 10000, remaining)), resource_limit=resource_limit)
            problem = solver.to_smt2()
            names = tuple(graph.names)
            if timeout_ms <= 0 or remaining <= 0 or not topology.supported:
                reason = 'computation limit' if topology.supported else '; '.join(topology.reasons)
            else:
                answer = solver.check()
                raw_status = str(answer)
                if answer == z3.sat:
                    status = 'compatible'
                    reason = 'Exact model has a compatible configuration under these bounds'
                    model = solver.model()
                    witness = {str(v): model[v].sexpr() for v in sorted(model.decls(), key=str)}
                    if not all(z3.is_true(model.eval(c, model_completion=True)) for c in graph.constraints):
                        status, raw_status, reason, witness = 'unresolved', 'unknown', 'exact witness verification incomplete', {}
                elif answer == z3.unsat:
                    status = 'incompatible'
                    reason = 'No configuration satisfies the versioned model constraints; no independently verified proof certificate claimed'
                else:
                    reason = solver.reason_unknown()
        except (ValueError, KeyError) as exc:
            reason = str(exc)
            reasons.append(reason)
        except (z3.Z3Exception, MemoryError) as exc:
            reason = 'solver/resource failure: ' + type(exc).__name__
        problem_hash = hashlib.sha256((z3.get_version_string() + '\n' + problem + '\n' + snapshot_hash + '\n' + source.id).encode()).hexdigest()
        output.append(ClassResult(**source.model_dump(), status=status, solver_status=raw_status, reason=reason,
            problem_hash=problem_hash, problem_smt2=problem, witness=witness, constraints=names))
    eligible = not reasons
    # Ineligible assessments remain inspectable mathematically but cannot exclude.
    if not eligible:
        output = [c.model_copy(update={'status': 'unresolved', 'reason': 'Localization ineligible: ' + '; '.join(dict.fromkeys(reasons))}) if c.status == 'incompatible' else c for c in output]
    retained = [c for c in output if c.status != 'incompatible']
    return AssessmentResult(snapshot_hash=snapshot_hash, canonical_snapshot=canonical.decode(), engine_version=ENGINE_VERSION,
        solver_version=z3.get_version_string(), eligible=eligible, readiness_reasons=tuple(dict.fromkeys(reasons)), classes=tuple(output),
        retained_length_m=exact_text(sum((F(c.length_m) for c in retained), F())),
        retained_geometry_ids=tuple(sorted({g for c in retained for g in c.geometry_ids})),
        outside_domain_unresolved=topology.outside_domain_unresolved,
        model_conflict=bool(output) and all(c.status == 'incompatible' for c in output),
        computation_incomplete=any(c.status == 'unresolved' for c in output), assumptions=ASSUMPTIONS,
        dependencies=snapshot.dependencies)
