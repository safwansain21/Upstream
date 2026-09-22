"""One bounded expression graph compiles exact products or McCormick envelopes."""
from __future__ import annotations
from dataclasses import dataclass
from fractions import Fraction as F
import z3
import json

from .contracts import Snapshot, Action, Interval


def scope(*parts):
    """Injective encoding of IDs: user delimiters must never merge variables."""
    return json.dumps(parts, ensure_ascii=True, separators=(',', ':'))


def rational(value):
    value = F(value)
    return z3.RealVal(f'{value.numerator}/{value.denominator}')


@dataclass(frozen=True)
class Term:
    expr: z3.ArithRef
    lo: F
    hi: F


def product_bounds(a, b):
    values = (a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi)
    return min(values), max(values)


def mccormick_constraints(w, x, y, lx, ux, ly, uy):
    lx, ux, ly, uy = map(rational, (lx, ux, ly, uy))
    return (w >= lx*y + ly*x - lx*ly,
            w >= ux*y + uy*x - ux*uy,
            w <= ux*y + ly*x - ux*ly,
            w <= lx*y + uy*x - lx*uy)


class ConstraintGraph:
    def __init__(self, prefix='', relaxed=False):
        self.prefix, self.relaxed = prefix, relaxed
        self.constraints = []
        self.names = []
        self.variables = {}
        self.products = []

    def add(self, predicate, name):
        self.constraints.append(predicate)
        self.names.append(name)

    def variable(self, name, lo, hi, shared_outcome=False):
        lo, hi = F(lo), F(hi)
        key = ('outcome:' if shared_outcome else self.prefix) + name
        if key in self.variables:
            old = self.variables[key]
            lo, hi = max(lo, old.lo), min(hi, old.hi)
            expr = old.expr
        else:
            expr = z3.Real(key)
        if lo > hi:
            self.add(z3.BoolVal(False), name + ':contradictory-shared-bounds')
            lo, hi = min(lo, hi), max(lo, hi)
        self.add(expr >= rational(lo), name + ':lower')
        self.add(expr <= rational(hi), name + ':upper')
        term = Term(expr, lo, hi)
        self.variables[key] = term
        return term

    def bounded(self, name, interval):
        return self.variable(name, interval.lo, interval.hi)

    def constant(self, value):
        value = F(value)
        return Term(rational(value), value, value)

    def plus(self, *terms):
        return Term(z3.Sum([t.expr for t in terms]), sum((t.lo for t in terms), F()), sum((t.hi for t in terms), F()))

    def multiply(self, x, y, label):
        lo, hi = product_bounds(x, y)
        if x.lo == x.hi:
            return Term(rational(x.lo)*y.expr, lo, hi)
        if y.lo == y.hi:
            return Term(x.expr*rational(y.lo), lo, hi)
        w = self.variable('product:' + label, lo, hi)
        if self.relaxed:
            for i, constraint in enumerate(mccormick_constraints(w.expr, x.expr, y.expr, x.lo, x.hi, y.lo, y.hi)):
                self.add(constraint, label + ':McCormick:' + str(i))
        else:
            self.add(w.expr == x.expr*y.expr, label + ':exact-product')
        self.products.append((w, x, y))
        return w

    def equal(self, a, b, name):
        self.add(a.expr == b.expr, name)

    def solver(self, timeout_ms=2000, resource_limit=None):
        solver = z3.SolverFor('QF_LRA' if self.relaxed else 'QF_NRA')
        solver.set(timeout=max(1, timeout_ms), random_seed=0)
        if resource_limit is not None:
            solver.set(rlimit=resource_limit)
        solver.add(*self.constraints)
        return solver


def accepted_readings(snapshot):
    return tuple(sorted({(r.id, r.version): r for r in snapshot.readings if r.qc == 'accepted'}.values(), key=lambda r: (r.id, r.version)))


def build_model(snapshot: Snapshot, signature, action: Action | None = None, *, relaxed=False, prefix=''):
    graph = ConstraintGraph(prefix=prefix, relaxed=relaxed)
    load = graph.bounded('load:' + snapshot.episode, snapshot.load)
    backgrounds = {b.station_id: b for b in snapshot.backgrounds}
    instruments = {(i.id, i.calibration_version): i for i in snapshot.instruments}
    waters = {w.id: w for w in snapshot.waters}
    readings = [(r, None) for r in accepted_readings(snapshot)]
    if action:
        readings += [(future.reading, future) for future in action.readings]
    for r, future in readings:
        rid = scope(r.id, r.version)
        if r.episode != snapshot.episode or not r.comparable:
            raise ValueError('Comparability is pending; never combine unrelated episode loads')
        if r.station_id not in backgrounds:
            raise ValueError('Background characterization needed at ' + r.station_id)
        bg = backgrounds[r.station_id]
        if bg.epoch != r.epoch:
            raise ValueError('Background epoch not applicable')
        midpoint = (bg.enclosure.lo + bg.enclosure.hi)/2
        radius = (bg.enclosure.hi - bg.enclosure.lo)/2
        if bg.drift is None:
            drift = graph.constant(0)
            residual = graph.variable('background-residual:' + scope(r.station_id, r.epoch), -radius, radius)
        else:
            drift = graph.bounded('drift:' + bg.drift_group, bg.drift)
            residual = graph.bounded('background-residual:' + scope(r.station_id, r.epoch), bg.residual)
        background = graph.plus(graph.constant(midpoint), drift, residual)
        graph.add(background.expr >= 0, rid + ':background-nonnegative')
        q = graph.bounded('discharge:' + rid, r.discharge)
        if r.station_id in signature:
            increment = graph.variable('increment:' + rid, 0, snapshot.load.hi/r.discharge.lo)
            graph.equal(graph.multiply(q, increment, rid + ':q*z'), load, rid + ':transport')
        else:
            increment = graph.constant(0)
        conductance = graph.plus(background, increment)
        graph.add(conductance.expr >= 0, rid + ':true-SC25-nonnegative')
        if r.mode == 'true_sc25_enclosure':
            if future:
                if future.uncertainty is None or future.uncertainty.unit != 'uS/cm':
                    raise ValueError('Future direct enclosure requires signed observation-error interval')
                error = graph.bounded('future-error:' + rid, future.uncertainty)
                observed = graph.plus(conductance, error)
                y = graph.variable(rid, observed.lo, observed.hi, shared_outcome=True)
                graph.equal(y, observed, rid + ':future-enclosure')
            else:
                graph.add(conductance.expr >= rational(r.enclosure.lo), rid + ':enclosure-lower')
                graph.add(conductance.expr <= rational(r.enclosure.hi), rid + ':enclosure-upper')
            continue
        if r.mode != 'raw':
            raise ValueError('Meter compensation not inverted/documented: history-only')
        if (r.instrument_id, r.calibration_version) not in instruments or r.water_group not in waters:
            raise ValueError('Missing calibration or water-condition group')
        instrument = instruments[(r.instrument_id, r.calibration_version)]
        if not instrument.valid_from <= r.measured_at <= instrument.valid_until:
            raise ValueError('Instrument calibration invalid at measurement time')
        if instrument.accounting == 'complete' and any(v.lo != 0 or v.hi != 0 for v in (r.noise, r.visit_effect)):
            raise ValueError('Complete accuracy bound cannot also add constituent noise/visit errors')
        calibration = scope(r.instrument_id, r.calibration_version)
        gain = graph.bounded('gain:' + calibration, instrument.gain)
        offset = graph.bounded('offset:' + calibration, instrument.offset)
        bias = graph.bounded('temperature-bias:' + calibration, instrument.temperature_bias)
        noise = graph.bounded('noise:' + rid, r.noise)
        visit = graph.bounded('visit:' + r.visit_id, r.visit_effect)
        temp_noise = graph.bounded('temperature-noise:' + rid, r.temperature_noise)
        temp_delta = graph.plus(graph.constant(F(r.temperature) - 25), bias, temp_noise)
        water = waters[r.water_group]
        water_scope = scope('shared', water.id) if water.sharing_evidence else scope('independent', r.id, r.version)
        alpha = graph.bounded('alpha:' + water_scope, water.coefficient)
        factor = graph.plus(graph.constant(1), graph.multiply(alpha, temp_delta, rid + ':alpha*T'))
        if factor.lo <= 0:
            raise ValueError('Compensation denominator can be nonpositive')
        graph.add(factor.expr > 0, rid + ':positive-compensation')
        scaled = graph.multiply(gain, conductance, rid + ':gain*C')
        raw = graph.plus(graph.multiply(scaled, factor, rid + ':gain*C*f'), offset, visit, noise)
        if future:
            y = graph.variable(rid, raw.lo, raw.hi, shared_outcome=True)
            graph.equal(y, raw, rid + ':future-raw')
        else:
            graph.equal(graph.constant(r.conductivity), raw, rid + ':raw-observation')
    return graph
