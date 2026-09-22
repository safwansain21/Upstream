"""Conservative full-path travel enclosures for the reviewed converging DAG."""
from collections import defaultdict, deque
from fractions import Fraction as F
from .graph import classify_network

def travel_enclosures(network,velocity):
    if velocity.unit != 'm/s' or velocity.lo <= 0:
        raise ValueError('Positive evidenced velocity in m/s required')
    if not classify_network(network).supported:
        raise ValueError('Travel unavailable on unsupported/unreviewed topology')
    outgoing,degree = defaultdict(list),defaultdict(int)
    for reach in network.reaches:
        outgoing[reach.upstream].append(reach)
        degree[reach.upstream] += 0
        degree[reach.downstream] += 1
    queue = deque(sorted(n for n,d in degree.items() if d==0))
    longest = defaultdict(F)
    while queue:
        node = queue.popleft()
        for reach in outgoing[node]:
            longest[reach.downstream] = max(longest[reach.downstream],longest[node]+F(reach.length_m))
            degree[reach.downstream] -= 1
            if degree[reach.downstream]==0:
                queue.append(reach.downstream)
    # An input can occur immediately above a station: lower endpoint zero.
    # Longest full path / slowest justified velocity includes every source reach.
    return {s.id:(F(0),longest[s.node]/velocity.lo) for s in network.stations}
