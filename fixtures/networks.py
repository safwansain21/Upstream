"""Synthetic canonical networks. These values carry no field-validation claim."""
from datetime import datetime, timedelta, timezone
from fractions import Fraction as F
from upstream_engine import (Interval, Network, Reach, Station, Background, Reading,
                             Readiness, Snapshot, Action, FutureReading)
from upstream_engine.graph import exact_text

def interval(lower, upper, unit='uS/cm'):
    return Interval(lower=str(lower), upper=str(upper), unit=unit, method='synthetic protocol bound',
                    source='SCIENTIFIC-ENGINE.md canonical fixture', validity_scope='synthetic episode',
                    data_origin='synthetic', reviewer='synthetic-fixture-review')

def _network(name, edges, stations):
    return Network(id=name, version='1', reaches=tuple(Reach(id=f'{a}-{b}', upstream=a, downstream=b,
        length_m=str(length), geometry_id=f'{name}:{a}-{b}', direction_verified=True,
        source='synthetic fixture') for a,b,length in edges),
        stations=tuple(Station(id=s, node=s, approved=True) for s in stations), reviewed=True,
        connectivity_verified=True, mixing_reviewed=True, boundary='closed',
        boundary_evidence='Explicit synthetic closed source domain assumption', data_origin='synthetic')

def network1():
    return _network('network1', [('Ahead','A1',1200),('A1','A2',900),('A2','A3',1100),
        ('A3','J',50),('Bhead','B1',1500),('B1','B2',800),('B2','B3',1000),('B3','J',50),
        ('J','C',500),('C','O',1400)], ['A1','A2','A3','B1','B2','B3','C','O'])

def network2():
    return _network('network2', [('Phead','P1',400),('P1','P2',600),('P2','J1',100),
        ('Qhead','Q1',700),('Q1','J1',100),('J1','R1',200),('R1','J2',800),
        ('Shead','S1',900),('S1','J2',100),('J2','T1',300),('T1','O',800)],
        ['P1','P2','Q1','R1','S1','T1','O'])

def unsupported_networks():
    split = _network('split-rejoin', [('head','A',100),('A','B',100),('A','C',100),
        ('B','D',100),('C','D',100),('D','O',100)], ['O'])
    tidal = network1()
    tidal = tidal.model_copy(update={'id':'tidal', 'reaches': (tidal.reaches[0].model_copy(update={'tidal':True}),) + tidal.reaches[1:]})
    cycle = _network('cycle', [('head','A',100),('A','B',100),('B','A',100)], ['B'])
    return split, tidal, cycle

DISCHARGES = dict(A1='.06', A2='.08', A3='.10', B1='.10', B2='.14', B3='.18', C='.28', O='.32')
START = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)

def direct_reading(station, value, uncertainty='5', *, id=None, minute=0):
    q, x, u = F(DISCHARGES[station]), F(value), F(uncertainty)
    return Reading(id=id or station, version='1', station_id=station, visit_id=f'visit-{station}-{minute}',
        instrument_id=None, calibration_version=None, contributor='synthetic-person',
        measured_at=START+timedelta(minutes=minute), received_at=START+timedelta(minutes=minute+1),
        episode='synthetic-episode', epoch='synthetic-epoch', comparable=True, qc='accepted',
        mode='true_sc25_enclosure', enclosure=interval(exact_text(x-u), exact_text(x+u)),
        discharge=interval(exact_text(q*F('.85')), exact_text(q*F('1.15')), 'm3/s'),
        file_ref='fixture://network1', protocol_ref='synthetic-protocol-1', data_origin='synthetic')

def network1_snapshot(branch=None):
    if branch not in (None, 'high', 'low'):
        raise ValueError('Unknown synthetic branch')
    readings = (direct_reading('O','520', id='anchor-1'), direct_reading('O','520', id='anchor-2',minute=10),
                direct_reading('A3','440',minute=5))
    if branch:
        readings += (direct_reading('B2', '600' if branch == 'high' else '452',minute=6),)
    bounds = {'A3':('395','445'), 'O':('440','480'), 'B2':('405','455')}
    return Snapshot(network=network1(), readings=readings, backgrounds=tuple(Background(station_id=s,
        version='1', enclosure=interval(*bounds.get(s,('400','450'))), epoch='synthetic-epoch')
        for s in DISCHARGES), load=interval('0','100','(uS/cm)*(m3/s)'), episode='synthetic-episode',
        protocol_version='synthetic-protocol-1', readiness=Readiness(persistence_reviewed=True,
        persistence_evidence='Synthetic sustained load by construction', transport_reviewed=True,
        transport_evidence='Synthetic [.15,.45] m/s; maximum relevant path / minimum velocity',
        max_travel_seconds='40000', sustained_seconds='50000', anchor_station='O', anchor_min_spacing_seconds='300',
        velocity=interval('.15','.45','m/s')),
        dependencies={'network':'1','protocol':'synthetic-protocol-1','engine':'1.0.0'}, data_origin='synthetic')

def b2_action(uncertainty='5'):
    return Action(id='visit-B2', readings=(FutureReading(reading=direct_reading('B2','450',
        id='future-B2',minute=15), uncertainty=interval(exact_text(-F(uncertainty)), uncertainty)),),
        approved_station=True, qualified_participant=True, verified_instrument=True,
        permissible_access=True, timing_comparable=True, travel_task_minutes='25')
