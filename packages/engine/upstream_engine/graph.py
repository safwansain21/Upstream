"""Directed topology, station splitting, and source identifiability classes."""
from collections import defaultdict
from fractions import Fraction
import hashlib

from .contracts import Network, Reach, Station, StrictModel


def exact_text(value: Fraction) -> str:
    value = Fraction(value)
    n = value.denominator
    while n % 2 == 0:
        n //= 2
    while n % 5 == 0:
        n //= 5
    if n != 1:
        return str(value)
    # Long division is exact and independent of Decimal context precision.
    sign = '-' if value < 0 else ''
    numerator, denominator = abs(value.numerator), value.denominator
    whole, rem = divmod(numerator, denominator)
    digits = ''
    while rem:
        digit, rem = divmod(rem * 10, denominator)
        digits += str(digit)
    return sign + str(whole) + ('.' + digits if digits else '')


class SourceClass(StrictModel):
    id: str
    signature: tuple[str, ...]
    reach_ids: tuple[str, ...]
    geometry_ids: tuple[str, ...]
    length_m: str


class GraphResult(StrictModel):
    supported: bool
    reasons: tuple[str, ...]
    classes: tuple[SourceClass, ...]
    total_length_m: str
    outside_domain_unresolved: bool


def classify_network(network: Network) -> GraphResult:
    outgoing = defaultdict(list)
    for r in network.reaches:
        outgoing[r.upstream].append(r.downstream)
    reasons = []
    if any(r.tidal for r in network.reaches):
        reasons.append('unsupported_flow_model: tidal or bidirectional reach')
    if any(len(v) > 1 for v in outgoing.values()):
        reasons.append('unsupported_flow_model: directed split/diversion')
    active, done = set(), set()

    def cyclic(node):
        if node in active:
            return True
        if node in done:
            return False
        active.add(node)
        found = any(cyclic(n) for n in outgoing[node])
        active.remove(node)
        done.add(node)
        return found

    for node in list(outgoing):
        if cyclic(node):
            reasons.append('unsupported_flow_model: directed cycle')
            break
    if not network.connectivity_verified or any(not r.direction_verified for r in network.reaches):
        reasons.append('mapping_incomplete: connectivity or direction unknown')
    if not network.reviewed or not network.mixing_reviewed:
        reasons.append('mapping_incomplete: network or mixing not reviewed')
    if any(not s.approved for s in network.stations):
        reasons.append('mapping_incomplete: station position not approved')
    if network.boundary == 'unknown' or not network.boundary_evidence:
        reasons.append('mapping_incomplete: boundary treatment not evidenced')
    stations = defaultdict(list)
    for s in network.stations:
        stations[s.node].append(s.id)
    grouped = defaultdict(list)
    for r in network.reaches:
        # Source at a station belongs to its immediately upstream reach.
        reachable, queue = set(), [r.downstream]
        while queue:
            node = queue.pop()
            if node in reachable:
                continue
            reachable.add(node)
            queue.extend(outgoing[node])
        signature = tuple(sorted(s for n in reachable for s in stations[n]))
        # Unsupported topology cannot obtain informative classes by assumption.
        grouped[signature].append(r)
    classes = []
    for signature, reaches in sorted(grouped.items()):
        cid = 'class-' + hashlib.sha256('\0'.join(signature).encode()).hexdigest()[:12]
        classes.append(SourceClass(id=cid, signature=signature,
            reach_ids=tuple(sorted(r.id for r in reaches)),
            geometry_ids=tuple(sorted({r.geometry_id for r in reaches})),
            length_m=exact_text(sum((Fraction(r.length_m) for r in reaches), Fraction()))))
    return GraphResult(supported=not reasons, reasons=tuple(reasons), classes=tuple(classes),
        total_length_m=exact_text(sum((Fraction(r.length_m) for r in network.reaches), Fraction())),
        outside_domain_unresolved=network.boundary != 'closed')


def split_reach(network: Network, reach_id: str, station_id: str, distance_m: str) -> Network:
    """Insert a station at exact channel distance, preserving total channel length."""
    from .contracts import decimal_text
    distance = Fraction(decimal_text(distance_m))
    reach = next(r for r in network.reaches if r.id == reach_id)
    if not 0 < distance < Fraction(reach.length_m):
        raise ValueError('Station split must be inside reach')
    if station_id in {s.id for s in network.stations}:
        raise ValueError('Station already exists')
    node = 'station:' + station_id
    if node in {r.upstream for r in network.reaches} | {r.downstream for r in network.reaches}:
        raise ValueError('Station node collides with existing node')
    first = reach.model_copy(update={'id': reach.id + ':up', 'downstream': node, 'length_m': exact_text(distance), 'geometry_id': reach.geometry_id + ':up'})
    second = reach.model_copy(update={'id': reach.id + ':down', 'upstream': node, 'length_m': exact_text(Fraction(reach.length_m) - distance), 'geometry_id': reach.geometry_id + ':down'})
    return network.model_copy(update={'version': network.version + '+station', 'reviewed': False,
        'reaches': tuple(r for r in network.reaches if r.id != reach_id) + (first, second),
        'stations': network.stations + (Station(id=station_id, node=node, approved=False),)})
