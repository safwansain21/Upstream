"""Independent exact interval propagation and explicitly empirical coverage reports.

No floating point participates in compatibility. Wilson reports alone use floats.
Historical uncertainty is enclosed independently, so no historical/event cancellation
is credited. Event grouping is supplied from independent study design, never inferred
from low autocorrelation or convenient timestamps.
"""
from dataclasses import dataclass
from datetime import datetime
from fractions import Fraction as F
from math import sqrt
from statistics import NormalDist

def _interval(value):
    lo, hi = map(F,value)
    if lo > hi:
        raise ValueError('Invalid interval order')
    return lo, hi

def multiply(a,b):
    a,b = _interval(a),_interval(b)
    corners = [x*y for x in a for y in b]
    return min(corners),max(corners)

def divide(a,b):
    b = _interval(b)
    if b[0] <= 0:
        raise ValueError('All divisors must be positive')
    return multiply(a,(1/b[1],1/b[0]))

def raw_enclosure(*,raw,temperature,alpha,gain,offset,noise,visit):
    """SC25=(raw-offset-visit-noise)/(gain*(1+alpha*(T-25))).

    temperature is the true-temperature enclosure including calibration bias and
    reading noise; raw can already include display rounding or meter inversion.
    """
    raw,temperature,offset,noise,visit = map(_interval,(raw,temperature,offset,noise,visit))
    numerator = (raw[0]-offset[1]-noise[1]-visit[1],raw[1]-offset[0]-noise[0]-visit[0])
    af = multiply(alpha,(temperature[0]-25,temperature[1]-25))
    factor = (1+af[0],1+af[1])
    if _interval(gain)[0] <= 0 or factor[0] <= 0:
        raise ValueError('Gain and compensation factor must remain positive')
    result = divide(numerator,multiply(gain,factor))
    if result[1] < 0:
        raise ValueError('No nonnegative conductance in historical enclosure')
    return max(F(0),result[0]),result[1]

def compensated_difference(event,background,temperature,nominal_alpha,true_alpha,*,shared=False):
    """Regression arithmetic for nominally compensated point observations."""
    nominal_factor = 1+F(nominal_alpha)*(F(temperature)-25)
    if nominal_factor <= 0:
        raise ValueError('Nominal compensation factor must be positive')
    af = multiply(true_alpha,(F(temperature)-25,F(temperature)-25))
    factor = (1+af[0],1+af[1])
    if shared:
        delta = (F(event)-F(background))*nominal_factor
        return divide((delta,delta),factor)
    e = divide((F(event)*nominal_factor,)*2,factor)
    b = divide((F(background)*nominal_factor,)*2,factor)
    return e[0]-b[1],e[1]-b[0]

@dataclass(frozen=True)
class HistoricalEnclosure:
    id: str
    independent_event: str
    measured_at: datetime
    enclosure: tuple[F,F]
    scope: str
    source: str = 'Explicit historical input; review required before protocol use'
    transformation: str = 'Independent true-SC25 enclosure; no shared historical/event cancellation'

    def __post_init__(self):
        _interval(self.enclosure)
        if self.measured_at.tzinfo is None or not self.id or not self.independent_event or not self.scope:
            raise ValueError('Historical sample needs timezone, ID, independent event and scope')

@dataclass(frozen=True)
class EmpiricalBackground:
    enclosure: tuple[F,F]
    cutoff: datetime
    scope: str
    training_ids: tuple[str,...]
    training_events: tuple[str,...]
    records: tuple[HistoricalEnclosure,...]
    label: str = 'Empirical background range. Future-observation coverage has not been established for this site and protocol.'

def empirical_background(records,*,cutoff,scope):
    if cutoff.tzinfo is None:
        raise ValueError('Cutoff needs timezone')
    selected = tuple(sorted((r for r in records if r.measured_at < cutoff and r.scope == scope),
                            key=lambda r:(r.measured_at,r.id)))
    if not selected:
        raise ValueError('No historical records before cutoff in scope')
    if len({r.id for r in selected}) != len(selected):
        raise ValueError('Duplicate historical record ID')
    return EmpiricalBackground((min(r.enclosure[0] for r in selected),max(r.enclosure[1] for r in selected)),
        cutoff,scope,tuple(r.id for r in selected),tuple(sorted({r.independent_event for r in selected})),selected)

@dataclass(frozen=True)
class CoverageReport:
    contained_events: int
    independent_events: int
    sample_count: int
    wilson_lower: float | None
    wilson_upper: float | None
    confidence: float
    method: str = 'Two-sided Wilson score interval over independent held-out events; all samples must be contained'
    claim: str = 'Observed study performance, not a universal future-observation guarantee or automatic validation.'

def wilson(contained,total,confidence=.95):
    if not 0 < confidence < 1 or not 0 <= contained <= total:
        raise ValueError('Invalid coverage counts/confidence')
    if total == 0:
        return None,None
    z = NormalDist().inv_cdf((1+confidence)/2)
    p,z2 = contained/total,z*z
    center = (p+z2/(2*total))/(1+z2/total)
    half = z*sqrt(p*(1-p)/total+z2/(4*total*total))/(1+z2/total)
    return max(0.,center-half),min(1.,center+half)

def evaluate_coverage(fitted,records,*,confidence=.95):
    selected = [r for r in records if r.measured_at >= fitted.cutoff and r.scope == fitted.scope]
    if any(r.id in fitted.training_ids or r.independent_event in fitted.training_events for r in selected):
        raise ValueError('Held-out event overlaps fitting data')
    if len({r.id for r in selected}) != len(selected):
        raise ValueError('Duplicate held-out record ID')
    events = {}
    for r in selected:
        contained = fitted.enclosure[0] <= r.enclosure[0] and r.enclosure[1] <= fitted.enclosure[1]
        events[r.independent_event] = events.get(r.independent_event,True) and contained
    k,n = sum(events.values()),len(events)
    lo,hi = wilson(k,n,confidence)
    return CoverageReport(k,n,len(selected),lo,hi,confidence)
