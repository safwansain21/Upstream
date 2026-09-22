from fractions import Fraction as F
from .model import accepted_readings
from .graph import classify_network


def readiness_reasons(snapshot):
    reasons = list(classify_network(snapshot.network).reasons)
    ready = snapshot.readiness
    readings = accepted_readings(snapshot)
    if not readings:
        reasons.append('accepted measurements needed')
    if not ready.persistence_reviewed or not ready.persistence_evidence:
        reasons.append('persistence evidence needs review')
    if not ready.transport_reviewed or not ready.transport_evidence:
        reasons.append('transport evidence needs review')
    if ready.velocity is None:
        reasons.append('evidenced path velocity bounds needed')
    else:
        from .transport import travel_enclosures
        try:
            paths = travel_enclosures(snapshot.network,ready.velocity)
            required = max((paths[r.station_id][1] for r in readings if r.station_id in paths),default=F(0))
            if ready.max_travel_seconds is None or F(ready.max_travel_seconds) < required:
                reasons.append('declared travel time does not cover all relevant paths and velocity uncertainty')
        except ValueError as exc:
            reasons.append(str(exc))
    if ready.max_travel_seconds is None or ready.sustained_seconds is None:
        reasons.append('transport/persistence time bounds unknown')
    else:
        span = F(str((max(r.measured_at for r in readings) - min(r.measured_at for r in readings)).total_seconds())) if readings else F(0)
        if F(ready.max_travel_seconds) < 0 or F(ready.sustained_seconds) < span + F(ready.max_travel_seconds):
            reasons.append('sustained evidence does not cover observation span plus travel')
    anchor = [r for r in readings if r.station_id == ready.anchor_station]
    if len(anchor) < 2 or ready.anchor_min_spacing_seconds is None:
        reasons.append('two appropriately spaced accepted anchor readings needed')
    elif F(ready.anchor_min_spacing_seconds) <= 0 or F(str((max(r.measured_at for r in anchor) - min(r.measured_at for r in anchor)).total_seconds())) < F(ready.anchor_min_spacing_seconds):
        reasons.append('anchor readings too close for reviewed protocol')
    approved = {s.id for s in snapshot.network.stations if s.approved}
    for r in readings:
        if r.station_id not in approved:
            reasons.append('unapproved station: ' + r.station_id)
        if r.episode != snapshot.episode or not r.comparable:
            reasons.append('comparability pending: ' + r.id)
    return tuple(dict.fromkeys(reasons))
