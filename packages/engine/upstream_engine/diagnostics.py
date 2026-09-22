"""Finite bisection diagnostics; never present an inferred exact threshold."""
from dataclasses import dataclass
from fractions import Fraction as F
import time
from .contracts import Action
from .graph import exact_text
from .solver import assess
from .planner import plan

@dataclass(frozen=True)
class PrecisionBracket:
    available: bool
    lower: str | None
    upper: str | None
    reason: str
    evaluations: int
    label: str = 'Precision bracket for the conservative relaxed model'

def precision_bracket(snapshot,action,*,lower,upper,tolerance,reading_index=0,timeout_ms=30000):
    """Vary one direct-enclosure symmetric uncertainty; other bounds stay fixed.

    The caller must justify the explored range. This does not recommend replicate
    averaging, alter compensation/systematic bounds, or validate field precision.
    """
    lo,hi,tol = map(F,(lower,upper,tolerance))
    if not 0 <= lo < hi or tol <= 0:
        raise ValueError('Ordered nonnegative bracket and positive tolerance required')
    future = action.readings[reading_index]
    if future.reading.mode != 'true_sc25_enclosure' or future.uncertainty is None:
        return PrecisionBracket(False,None,None,'Diagnostic requires an explicitly justified direct-enclosure uncertainty',0)
    deadline = time.monotonic()+min(max(timeout_ms,0),120000)/1000
    evaluations = 0
    assessment = assess(snapshot)
    def score(value):
        nonlocal evaluations
        remaining = int((deadline-time.monotonic())*1000)
        if remaining <= 0:
            return None
        uncertainty = future.uncertainty.model_copy(update={'lower':exact_text(-value),'upper':exact_text(value)})
        readings = list(action.readings)
        readings[reading_index] = future.model_copy(update={'uncertainty':uncertainty})
        result = plan(snapshot,action.model_copy(update={'readings':tuple(readings)}),timeout_ms=min(5000,remaining),assessment=assessment)
        evaluations += 1
        if not result.completed or result.conservative_bound_m is None:
            return None
        return F(result.conservative_bound_m) < F(result.retained_length_m)
    low_gain,high_gain = score(lo),score(hi)
    if low_gain is not True or high_gain is not False:
        return PrecisionBracket(False,None,None,'No completed reducing/nonreducing bracket within justified bounds; relaxation or computation may limit discrimination',evaluations)
    while hi-lo > tol:
        mid = (lo+hi)/2
        gained = score(mid)
        if gained is None:
            return PrecisionBracket(False,exact_text(lo),exact_text(hi),'Computation limit before requested bracket tolerance',evaluations)
        if gained:
            lo = mid
        else:
            hi = mid
    return PrecisionBracket(True,exact_text(lo),exact_text(hi),'Lower endpoint reduces conservative bound; upper endpoint does not. Equality may remain ambiguous.',evaluations)
