from fractions import Fraction as F
from datetime import timedelta
import z3
from hypothesis import given, settings, strategies as st
from upstream_engine import assess, plan, classify_network, canonical_hash
from upstream_engine.model import build_model, mccormick_constraints, rational
from upstream_engine.oracle import independent_feasible
from fixtures.networks import network1_snapshot, b2_action, interval, START, _network
from fixtures.raw import raw_snapshot

P = settings(max_examples=20,deadline=None,derandomize=True,database=None)

@P
@given(st.integers(0,100),st.integers(0,100),st.integers(0,100),st.integers(1,100))
def test_exact_products_are_inside_mccormick_envelopes(a,b,c,d):
    lx,ux = sorted((F(a-50),F(b)))
    ly,uy = sorted((F(c-50),F(d)))
    x = lx+(ux-lx)*F(a,100)
    y = ly+(uy-ly)*F(c,100)
    assert all(z3.is_true(z3.simplify(k)) for k in mccormick_constraints(rational(x*y),rational(x),rational(y),lx,ux,ly,uy))

@P
@given(st.integers(0,30),st.integers(0,20))
def test_widening_bounds_and_removing_evidence_preserve_feasible_classes(noise,load_extra):
    s = raw_snapshot()
    initial = assess(s)
    widened = s.model_copy(update={'load':interval('0',str(100+load_extra),'(uS/cm)*(m3/s)'),
        'readings':tuple(r.model_copy(update={'noise':interval(str(-5-noise),str(5+noise))}) for r in s.readings)})
    broader = assess(widened)
    less = assess(s.model_copy(update={'readings':s.readings[:-1]}))
    for a,b,c in zip(initial.classes,broader.classes,less.classes):
        if a.status == 'compatible':
            assert b.status != 'incompatible' and c.status != 'incompatible'

@settings(max_examples=12,deadline=None,derandomize=True,database=None)
@given(st.lists(st.integers(1,10),min_size=2,max_size=6),st.integers(1,30),st.integers(300,500),st.integers(0,99))
def test_generated_converging_graph_truth_retention(lengths,load,background,selector):
    # Each node chooses a strictly later parent: an independently generated DAG.
    n = len(lengths)
    parent = {i:min(n,i+1+(lengths[i]%max(1,n-i))) for i in range(n)}
    edges = [(str(i),str(parent[i]),lengths[i]*100) for i in range(n)]
    net = _network('generated',edges,[str(i) for i in range(1,n+1)])
    truth = selector%n
    downstream,node = set(),parent[truth]
    while True:
        downstream.add(str(node))
        if node == n:
            break
        node = parent[node]
    template = network1_snapshot()
    backgrounds = tuple(template.backgrounds[0].model_copy(update={'station_id':str(i),'enclosure':interval(str(background),str(background))}) for i in range(1,n+1))
    readings = []
    for i in range(1,n+1):
        x = background+(load if str(i) in downstream else 0)
        readings.append(template.readings[0].model_copy(update={'id':'r'+str(i),'station_id':str(i),
            'enclosure':interval(str(x),str(x)),'discharge':interval('1','1','m3/s')}))
    readings.append(readings[-1].model_copy(update={'id':'anchor-repeat','measured_at':START+timedelta(minutes=10)}))
    s = template.model_copy(update={'network':net,'readings':tuple(readings),'backgrounds':backgrounds,
        'readiness':template.readiness.model_copy(update={'anchor_station':str(n)})})
    result = assess(s)
    true_class = next(c for c in result.classes if f'{truth}-{parent[truth]}' in c.reach_ids)
    assert result.eligible and true_class.status == 'compatible'
    # Exact witness must also satisfy the independently compiled outer relaxation.
    exact = build_model(s,true_class.signature)
    solver = exact.solver()
    assert solver.check() == z3.sat
    relaxed = build_model(s,true_class.signature,relaxed=True)
    assert all(z3.is_true(solver.model().eval(c,model_completion=True)) for c in relaxed.constraints)

def test_fraction_oracle_agrees_with_all_canonical_classes():
    for branch in (None,'high','low'):
        s = network1_snapshot(branch)
        rows = [(r.station_id,(r.enclosure.lo,r.enclosure.hi),
            next((b.enclosure.lo,b.enclosure.hi) for b in s.backgrounds if b.station_id==r.station_id),
            (r.discharge.lo,r.discharge.hi)) for r in s.readings]
        for c in assess(s).classes:
            assert (c.status=='compatible') == independent_feasible(rows,c.signature)

def test_raw_shared_scopes_and_independent_compensation():
    for shared,expected in ((False,3),(True,1)):
        s = raw_snapshot(temperature='15',sharing=shared)
        graph = build_model(s,('O',))
        assert sum(name.startswith('alpha:') for name in graph.variables) == expected
        assert sum(name.startswith('gain:') for name in graph.variables) == 1
        assert sum(name.startswith('offset:') for name in graph.variables) == 1
        s = s.model_copy(update={'readings':tuple(r.model_copy(update={'visit_id':'same'}) for r in s.readings)})
        assert sum(name.startswith('visit:') for name in build_model(s,('O',)).variables) == 1

def test_delimiter_collisions_cannot_merge_distinct_reading_errors():
    s = raw_snapshot()
    a = s.readings[0].model_copy(update={'id':'sample@version','version':'1'})
    b = s.readings[1].model_copy(update={'id':'sample','version':'version@1'})
    s = s.model_copy(update={'readings':(a,b,s.readings[2])})
    graph = build_model(s,('O',))
    assert sum(name.startswith('noise:') for name in graph.variables) == 3

def test_planner_oracle_and_resource_limits():
    from upstream_engine import witness_oracle
    s = network1_snapshot()
    for uncertainty in ('4','5'):
        action = b2_action(uncertainty)
        upper = plan(s,action)
        lower = witness_oracle(s,action,[(F(x),) for x in [450,455,459,460,500,600]])
        assert F(lower) <= F(upper.conservative_bound_m)
        limited = plan(s,action,resource_limit=1)
        assert not limited.completed and F(limited.conservative_bound_m) >= F(upper.conservative_bound_m)

def test_negative_event_is_conflict_and_resource_failure_retains(monkeypatch):
    s = network1_snapshot()
    s = s.model_copy(update={'readings':tuple(r.model_copy(update={'enclosure':interval('1','2')}) for r in s.readings)})
    assert assess(s).model_conflict
    from upstream_engine.model import ConstraintGraph
    def failed(*args,**kwargs):
        raise MemoryError('deterministic injected resource exhaustion')
    monkeypatch.setattr(ConstraintGraph,'solver',failed)
    failed_result = assess(s)
    assert F(failed_result.retained_length_m)==8500 and not failed_result.model_conflict
