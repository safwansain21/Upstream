"""Independent Fraction arithmetic; no Z3/model/compiler imports."""
from fractions import Fraction as F


def load_enclosure(observation, background, discharge):
    lo = max(F(0), observation[0] - background[1])
    hi = observation[1] - background[0]
    if hi < 0:
        return None
    return discharge[0] * lo, discharge[1] * hi


def discrimination_threshold(load_min, discharge_max, background_width):
    """Strict separation requires U < returned value; equality is ambiguous."""
    return (load_min / discharge_max - background_width) / 2


def independent_feasible(readings, signature, load=(F(0), F(100))):
    """Simple independent station enclosure oracle, not a raw/shared-error model."""
    low, high = load
    for station, observation, background, discharge in readings:
        if station not in signature:
            if max(observation[0], background[0]) > min(observation[1], background[1]):
                return False
        else:
            interval = load_enclosure(observation, background, discharge)
            if interval is None:
                return False
            low, high = max(low, interval[0]), min(high, interval[1])
    return low <= high
