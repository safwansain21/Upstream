"""Pure exact scientific model. No dependency on UI, simulator, or AI."""
from .contracts import (Interval, Network, Reach, Station, Background, Instrument, WaterGroup,
    Reading, Readiness, Snapshot, FutureReading, Action, AssessmentResult, ClassResult, PlanResult)
from .canonical import canonical_bytes, canonical_hash
from .graph import classify_network, split_reach
from .solver import assess
from .planner import plan, witness_oracle, rank_actions

__all__ = ['Interval', 'Network', 'Reach', 'Station', 'Background', 'Instrument', 'WaterGroup',
    'Reading', 'Readiness', 'Snapshot', 'FutureReading', 'Action', 'AssessmentResult', 'ClassResult',
    'PlanResult', 'canonical_bytes', 'canonical_hash', 'classify_network', 'split_reach', 'assess',
    'plan', 'witness_oracle', 'rank_actions']
