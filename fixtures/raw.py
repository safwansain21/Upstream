"""Raw synthetic observations, isolated from the production scientific package."""
from datetime import timedelta
from fractions import Fraction as F
from upstream_engine import Instrument, WaterGroup
from upstream_engine.graph import exact_text
from .networks import network1_snapshot, interval, START

def raw_snapshot(*, temperature='25', coefficient=('.018','.022'), sharing=False):
    snapshot = network1_snapshot()
    instrument = Instrument(id='meter',calibration_version='1',gain=interval('1','1','1'),
        offset=interval('0','0'),temperature_bias=interval('0','0','degC'),accounting='decomposed',
        valid_from=START-timedelta(days=1),valid_until=START+timedelta(days=1))
    water = WaterGroup(id='water',coefficient=interval(*coefficient,'1/degC'),
        sharing_evidence='Explicit synthetic common composition' if sharing else None)
    readings = tuple(r.model_copy(update=dict(mode='raw',enclosure=None,
        conductivity=exact_text((r.enclosure.lo+r.enclosure.hi)/2*(1+F('.02')*(F(temperature)-25))),
        temperature=temperature,instrument_id='meter',calibration_version='1',
        noise=interval('-5','5'),visit_effect=interval('0','0'),temperature_noise=interval('0','0','degC'),
        water_group='water')) for r in snapshot.readings)
    return snapshot.model_copy(update={'readings':readings,'instruments':(instrument,),'waters':(water,)})
