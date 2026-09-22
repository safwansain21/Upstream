"""Build the immutable engine input from versioned database records. No UI, AI or simulator fields reach the engine.

Record conventions (JSON columns hold engine Interval objects verbatim):
- reading_versions.bounds: {enclosure|noise|temperature_noise|visit_effect: Interval, discharge: Interval,
  water_group, episode, epoch, comparable}
- background_versions.enclosure: Interval; background_versions.scope: {epoch}
- transport_versions.configuration (the reviewed episode/transport record for a case):
  {episode, protocol_version, load: Interval, readiness: engine Readiness fields,
   discharge: {station_code: Interval}, future_uncertainty: decimal string, planned_visit_at: ISO time}
  ponytail: one reviewed record per case episode; split into protocol/episode tables if several episodes per case appear.
"""
import hashlib
import json
from datetime import datetime

from pydantic import ValidationError
from upstream_engine import (Action, Background, FutureReading, Instrument, Interval, Network, Reach, Readiness,
                             Reading, Snapshot, Station, WaterGroup)
from upstream_engine.graph import classify_network
from upstream_engine.solver import ENGINE_VERSION

QC = {'accepted': 'accepted', 'excluded': 'excluded', 'suspect': 'suspect'}


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


class NotReady(Exception):
    """Inputs cannot form an engine snapshot yet; each reason names the missing prerequisite."""
    def __init__(self, reasons):
        self.reasons = list(reasons)
        super().__init__('; '.join(self.reasons))


def load_inputs(db, org, case):
    case_row = db.execute('select id,network_id,data_origin from cases where org_id=%s and id=%s', (org, case)).fetchone()
    if not case_row:
        raise NotReady(['case not found'])
    if not case_row['network_id']:
        raise NotReady(['mapping_incomplete: no local network version recorded'])
    net = db.execute('select * from network_versions where id=%s', (case_row['network_id'],)).fetchone()
    nodes = {r['id']: r for r in db.execute('select id,code from network_nodes where network_id=%s', (net['id'],))}
    edges = db.execute('select id,code,from_node,to_node,length_m,flow_status,connectivity from network_edges where network_id=%s order by code',
                       (net['id'],)).fetchall()
    stations = db.execute("select id,code,status,access_status from stations where case_id=%s and network_id=%s order by code",
                          (case, net['id'])).fetchall()
    readings = db.execute('''select r.*, s.code station_code, i.serial, q.disposition from reading_versions r
        join stations s on s.id=r.station_id join instruments i on i.id=r.instrument_id
        left join lateral (select disposition from quality_decisions d where d.reading_id=r.id order by created_at desc limit 1) q on true
        where r.case_id=%s and r.station_id in (select id from stations where case_id=%s)
        and not exists(select 1 from reading_versions n where n.entity_id=r.entity_id and n.version>r.version)
        order by r.entity_id''', (case, case)).fetchall()
    backgrounds = db.execute('''select distinct on (b.station_id) b.*, s.code station_code from background_versions b
        join stations s on s.id=b.station_id where s.case_id=%s order by b.station_id, b.version desc''', (case,)).fetchall()
    transport = db.execute('select * from transport_versions where case_id=%s order by version desc limit 1', (case,)).fetchone()
    calibrations = db.execute('''select c.*, i.serial from calibration_events c join instruments i on i.id=c.instrument_id
        where c.id in (select calibration_id from reading_versions where case_id=%s) and c.bounds is not null''', (case,)).fetchall()
    waters = db.execute('select * from water_condition_groups where org_id=%s', (org,)).fetchall()
    return case_row, net, nodes, edges, stations, readings, backgrounds, transport, calibrations, waters


def build(db, org, case) -> tuple[Snapshot, list[dict], dict]:
    """Returns (snapshot, dependency rows, planner context). Raises NotReady listing every missing input found."""
    case_row, net, nodes, edges, stations, readings, backgrounds, transport, calibrations, waters = load_inputs(db, org, case)
    origin = case_row['data_origin']
    try:
        network = Network(
            id=str(net['id']), version=str(net['version']), data_origin=origin,
            reaches=tuple(Reach(id=e['code'], upstream=nodes[e['from_node']]['code'], downstream=nodes[e['to_node']]['code'],
                                length_m=str(e['length_m']), geometry_id=str(e['id']), direction_verified=e['flow_status'] == 'verified',
                                tidal=e['flow_status'] == 'tidal', source=net['source']) for e in edges),
            stations=tuple(Station(id=s['code'], node=s['code'], approved=s['status'] == 'approved') for s in stations),
            reviewed=net['status'] == 'reviewed', connectivity_verified=all(e['connectivity'] == 'verified' for e in edges),
            mixing_reviewed=bool(net['mixing_reviewed']), boundary=net['boundary_treatment'] if net['boundary_treatment'] in ('closed', 'open') else 'unknown',
            boundary_evidence=(net['evidence_refs'] or [None])[0])
    except (ValidationError, KeyError) as exc:
        raise NotReady([f'mapping_incomplete: network version invalid ({str(exc).splitlines()[0][:200]})'])
    missing = list(classify_network(network).reasons)
    if not transport:
        missing.append('transport/episode review needed: no reviewed load, discharge, persistence or velocity record')
    if not readings:
        missing.append('accepted measurements needed')
    if not transport or not readings:
        raise NotReady(missing)
    cfg = transport['configuration']
    try:
        snapshot = Snapshot(
            network=network, episode=cfg['episode'], protocol_version=cfg['protocol_version'], load=Interval(**cfg['load']),
            readiness=Readiness(**cfg['readiness']), data_origin=origin,
            readings=tuple(reading(r, cfg['episode']) for r in readings),
            backgrounds=tuple(Background(station_id=b['station_code'], version=str(b['version']), enclosure=Interval(**b['enclosure']),
                                         epoch=b['scope'].get('epoch', 'unspecified')) for b in backgrounds),
            instruments=tuple(Instrument(id=c['serial'], calibration_version=str(c['id']), valid_from=c['effective_from'],
                                         valid_until=c['effective_until'], **c['bounds']) for c in calibrations),
            waters=tuple(WaterGroup(id=str(w['id']), coefficient=Interval(**w['coefficient']), sharing_evidence=w['justification'])
                         for w in waters if any(r['bounds'].get('water_group') == str(w['id']) for r in readings)),
            dependencies={'network': f"{net['id']}@{net['version']}", 'transport': f"{transport['id']}@{transport['version']}",
                          'protocol': cfg['protocol_version'], 'engine': ENGINE_VERSION})
    except (ValidationError, KeyError, TypeError, ValueError) as exc:
        raise NotReady([f'input validation: {exc}'.splitlines()[0][:300]])
    deps = [dict(entity_type='network_version', entity_id=net['id'], version=net['version'], content_hash=net['content_hash'], reason='network topology and lengths'),
            dict(entity_type='transport_version', entity_id=transport['id'], version=transport['version'], content_hash=transport['content_hash'], reason='load, discharge, persistence and transport review')]
    deps += [dict(entity_type='reading_version', entity_id=r['id'], version=r['version'], content_hash=r['content_hash'],
                  reason=f"reading at {r['station_code']} ({QC.get(r['disposition'] or '', 'pending')})") for r in readings]
    deps += [dict(entity_type='background_version', entity_id=b['id'], version=b['version'], content_hash=b['content_hash'],
                  reason=f"background at {b['station_code']}") for b in backgrounds]
    return snapshot, deps, {'stations': stations, 'config': cfg}


def reading(r, episode) -> Reading:
    b = r['bounds'] or {}
    iv = lambda k: Interval(**b[k]) if b.get(k) else None  # noqa: E731
    return Reading(id=str(r['entity_id']), version=str(r['version']), station_id=r['station_code'], visit_id=str(r['visit_id']),
                   instrument_id=r['serial'] if r['mode'] == 'raw' else None,
                   calibration_version=str(r['calibration_id']) if r['mode'] == 'raw' and r['calibration_id'] else None,
                   contributor='pseudonym:' + digest(str(r['operator_id']))[:12], measured_at=r['measured_at'], received_at=r['received_at'],
                   episode=b.get('episode', episode), epoch=b.get('epoch', 'unspecified'), comparable=bool(b.get('comparable')),
                   qc=QC.get(r['disposition'] or '', 'pending'), mode=r['mode'],
                   conductivity=str(r['value']) if r['mode'] == 'raw' else None,
                   temperature=str(r['temperature']) if r['mode'] == 'raw' and r['temperature'] is not None else None,
                   enclosure=iv('enclosure'), noise=iv('noise'), temperature_noise=iv('temperature_noise'), visit_effect=iv('visit_effect'),
                   water_group=b.get('water_group'), discharge=Interval(**b['discharge']), file_ref=f"reading_version:{r['id']}",
                   protocol_ref=str(r['protocol_id'] or 'unspecified'), data_origin=r['data_origin'])


def candidate_actions(db, org, snapshot: Snapshot, context) -> list[Action]:
    """One protocol visit per approved station with reviewed discharge and background. Flags come from live records."""
    cfg = context['config']
    if not cfg.get('future_uncertainty') or not cfg.get('planned_visit_at'):
        return []
    qualified = db.execute('''select exists(select 1 from qualifications q join memberships m on m.id=q.membership_id
        where m.org_id=%s and m.status='active' and q.task_type='conductance_reading' and q.valid_until>now()) ok''', (org,)).fetchone()['ok']
    verified = db.execute('''select exists(select 1 from instruments i join calibration_events c on c.instrument_id=i.id
        where i.org_id=%s and i.available and c.status='pass' and c.effective_until>now()) ok''', (org,)).fetchone()['ok']
    backgrounds = {b.station_id: b for b in snapshot.backgrounds}
    when = datetime.fromisoformat(cfg['planned_visit_at'])
    actions = []
    for s in context['stations']:
        code = s['code']
        if code not in backgrounds or code not in cfg.get('discharge', {}):
            continue
        u = cfg['future_uncertainty']
        base = Interval(**cfg['load']).model_dump() | {'unit': 'uS/cm'}
        future = Reading(id=f'future-{code}', version='1', station_id=code, visit_id=f'planned-{code}', instrument_id=None,
                         calibration_version=None, contributor='planned', measured_at=when, received_at=when, episode=snapshot.episode,
                         epoch=backgrounds[code].epoch, comparable=True, qc='accepted', mode='true_sc25_enclosure',
                         enclosure=backgrounds[code].enclosure,  # placeholder: planner uses only the outcome error interval below
                         discharge=Interval(**cfg['discharge'][code]), file_ref='planned', protocol_ref=snapshot.protocol_version,
                         data_origin=snapshot.data_origin)
        actions.append(Action(id=f'visit-{code}', readings=(FutureReading(reading=future, uncertainty=Interval(**(base | {
            'lower': '-' + u, 'upper': u, 'method': 'protocol achievable enclosure half-width'}))),),
            approved_station=s['status'] == 'approved', qualified_participant=qualified, verified_instrument=verified,
            permissible_access=s['access_status'] == 'open', timing_comparable=True))
    return actions
