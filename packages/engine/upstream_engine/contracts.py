"""Strict scientific boundary. No simulator state, AI output, or context layers."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from typing import Annotated, Literal
import re

from pydantic import BaseModel, ConfigDict, BeforeValidator, model_validator


def decimal_text(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', value):
        raise ValueError('Scientific quantities must be finite base-10 strings')
    try:
        d = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError('Invalid decimal') from exc
    if not d.is_finite() or len(value) > 256 or abs(d.adjusted()) > 1000:
        raise ValueError('Decimal outside supported finite representation')
    # Decimal.normalize() rounds to the active context (usually 28 digits).
    # Formatting is exact; trim only fractional trailing zeros.
    text = format(d, 'f')
    return (text.rstrip('0').rstrip('.') if '.' in text else text) if d else '0'


DecimalText = Annotated[str, BeforeValidator(decimal_text)]
Origin = Literal['real', 'synthetic', 'replayed']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)


class Interval(StrictModel):
    lower: DecimalText
    upper: DecimalText
    unit: str
    method: str
    source: str
    validity_scope: str
    data_origin: Origin
    reviewer: str

    @model_validator(mode='after')
    def ordered(self):
        if self.lo > self.hi:
            raise ValueError('Interval lower exceeds upper')
        if not all((self.unit, self.method, self.source, self.validity_scope, self.reviewer)):
            raise ValueError('Interval provenance is required')
        return self

    @property
    def lo(self) -> Fraction:
        return Fraction(self.lower)

    @property
    def hi(self) -> Fraction:
        return Fraction(self.upper)


class Reach(StrictModel):
    id: str
    upstream: str
    downstream: str
    length_m: DecimalText
    geometry_id: str
    direction_verified: bool = False
    tidal: bool = False
    source: str

    @model_validator(mode='after')
    def positive_length(self):
        if Fraction(self.length_m) <= 0:
            raise ValueError('Reach length must be positive')
        return self


class Station(StrictModel):
    id: str
    node: str
    approved: bool = False


class Network(StrictModel):
    id: str
    version: str
    reaches: tuple[Reach, ...]
    stations: tuple[Station, ...]
    reviewed: bool = False
    connectivity_verified: bool = False
    mixing_reviewed: bool = False
    boundary: Literal['closed', 'open', 'unknown'] = 'unknown'
    boundary_evidence: str | None = None
    data_origin: Origin

    @model_validator(mode='after')
    def unique_ids(self):
        for items in (self.reaches, self.stations):
            if len({item.id for item in items}) != len(items):
                raise ValueError('Duplicate graph IDs')
        nodes = {r.upstream for r in self.reaches} | {r.downstream for r in self.reaches}
        if any(s.node not in nodes for s in self.stations):
            raise ValueError('Station node absent; split the reach at its location')
        return self


class Background(StrictModel):
    station_id: str
    version: str
    enclosure: Interval
    epoch: str
    drift: Interval | None = None
    drift_group: str | None = None
    residual: Interval | None = None
    sharing_evidence: str | None = None
    label: str = 'Empirical background range. Future-observation coverage has not been established for this site and protocol.'

    @model_validator(mode='after')
    def validate_background(self):
        if self.enclosure.unit != 'uS/cm' or self.enclosure.lo < 0:
            raise ValueError('Background requires nonnegative true-SC25 uS/cm bounds')
        if any(v is not None for v in (self.drift, self.drift_group, self.residual)):
            if not all((self.drift, self.drift_group, self.residual, self.sharing_evidence)):
                raise ValueError('Joint background decomposition requires evidence and all components')
        return self


class Instrument(StrictModel):
    id: str
    calibration_version: str
    gain: Interval
    offset: Interval
    temperature_bias: Interval
    accounting: Literal['decomposed', 'complete']
    valid_from: datetime
    valid_until: datetime

    @model_validator(mode='after')
    def physical(self):
        if self.gain.lo <= 0 or self.gain.unit != '1' or self.offset.unit != 'uS/cm' or self.temperature_bias.unit != 'degC':
            raise ValueError('Invalid instrument bounds or units')
        if self.valid_from.tzinfo is None or self.valid_until.tzinfo is None or self.valid_until <= self.valid_from:
            raise ValueError('Calibration needs ordered timezone-aware validity')
        return self


class WaterGroup(StrictModel):
    id: str
    coefficient: Interval
    sharing_evidence: str | None = None

    @model_validator(mode='after')
    def unit(self):
        if self.coefficient.unit != '1/degC':
            raise ValueError('Coefficient requires 1/degC')
        return self


class Reading(StrictModel):
    id: str
    version: str
    station_id: str
    visit_id: str
    instrument_id: str | None
    calibration_version: str | None
    contributor: str
    measured_at: datetime
    received_at: datetime
    episode: str
    epoch: str
    comparable: bool
    qc: Literal['accepted', 'excluded', 'pending', 'suspect']
    mode: Literal['raw', 'true_sc25_enclosure', 'meter_sc25']
    conductivity: DecimalText | None = None
    temperature: DecimalText | None = None
    enclosure: Interval | None = None
    noise: Interval | None = None
    temperature_noise: Interval | None = None
    visit_effect: Interval | None = None
    water_group: str | None = None
    discharge: Interval
    file_ref: str
    protocol_ref: str
    data_origin: Origin

    @model_validator(mode='after')
    def physical(self):
        if self.measured_at.tzinfo is None or self.received_at.tzinfo is None:
            raise ValueError('Measured/received timestamps require timezones')
        if self.discharge.unit != 'm3/s' or self.discharge.lo <= 0:
            raise ValueError('Positive discharge in m3/s required')
        if self.conductivity is not None and Fraction(self.conductivity) < 0:
            raise ValueError('Negative conductance unsupported')
        if self.mode == 'true_sc25_enclosure':
            if self.enclosure is None or self.enclosure.unit != 'uS/cm' or self.enclosure.lo < 0:
                raise ValueError('Nonnegative true-SC25 enclosure required')
            if any(v is not None for v in (self.noise, self.visit_effect, self.temperature_noise, self.water_group)):
                raise ValueError('Do not double count enclosure instrument errors')
        if self.mode == 'raw':
            if any(v is None for v in (self.conductivity, self.temperature, self.noise, self.temperature_noise, self.visit_effect, self.water_group, self.instrument_id, self.calibration_version)):
                raise ValueError('Raw records require complete calibration, compensation and uncertainty metadata')
            if self.noise.unit != 'uS/cm' or self.visit_effect.unit != 'uS/cm' or self.temperature_noise.unit != 'degC':
                raise ValueError('Invalid raw uncertainty units')
        return self


class Readiness(StrictModel):
    persistence_reviewed: bool = False
    persistence_evidence: str | None = None
    transport_reviewed: bool = False
    transport_evidence: str | None = None
    max_travel_seconds: DecimalText | None = None
    sustained_seconds: DecimalText | None = None
    anchor_station: str | None = None
    anchor_min_spacing_seconds: DecimalText | None = None
    velocity: Interval | None = None


class Snapshot(StrictModel):
    network: Network
    readings: tuple[Reading, ...]
    backgrounds: tuple[Background, ...]
    instruments: tuple[Instrument, ...] = ()
    waters: tuple[WaterGroup, ...] = ()
    load: Interval
    episode: str
    protocol_version: str
    readiness: Readiness
    dependencies: dict[str, str]
    data_origin: Origin
    bound_mode: Literal['protocol_bounds'] = 'protocol_bounds'

    @model_validator(mode='after')
    def references(self):
        if self.load.lo < 0 or self.load.unit != '(uS/cm)*(m3/s)':
            raise ValueError('Nonnegative effective conductance load bounds required')
        versions = {}
        for r in self.readings:
            key = (r.id, r.version)
            if key in versions and versions[key] != r:
                raise ValueError('Conflicting immutable reading version')
            versions[key] = r
        if len({b.station_id for b in self.backgrounds}) != len(self.backgrounds):
            raise ValueError('One applicable background per station required')
        if len({(i.id, i.calibration_version) for i in self.instruments}) != len(self.instruments):
            raise ValueError('Duplicate calibration')
        if len({w.id for w in self.waters}) != len(self.waters):
            raise ValueError('Duplicate water group')
        return self


class FutureReading(StrictModel):
    reading: Reading
    uncertainty: Interval | None = None


class Action(StrictModel):
    id: str
    readings: tuple[FutureReading, ...]
    approved_station: bool = False
    qualified_participant: bool = False
    verified_instrument: bool = False
    permissible_access: bool = False
    timing_comparable: bool = False
    travel_task_minutes: DecimalText | None = None
    purpose: str = 'Conservative model bound; future unresolved inference can retain more area. No guaranteed field discovery.'


class ClassResult(StrictModel):
    id: str
    signature: tuple[str, ...]
    reach_ids: tuple[str, ...]
    geometry_ids: tuple[str, ...]
    length_m: str
    status: Literal['compatible', 'incompatible', 'unresolved']
    solver_status: str
    reason: str
    problem_hash: str
    problem_smt2: str
    witness: dict[str, str] = {}
    constraints: tuple[str, ...] = ()


class AssessmentResult(StrictModel):
    snapshot_hash: str
    canonical_snapshot: str
    engine_version: str
    solver_version: str
    eligible: bool
    readiness_reasons: tuple[str, ...]
    classes: tuple[ClassResult, ...]
    retained_length_m: str
    retained_geometry_ids: tuple[str, ...]
    outside_domain_unresolved: bool
    model_conflict: bool
    computation_incomplete: bool
    assumptions: tuple[str, ...]
    dependencies: dict[str, str]


class PlanResult(StrictModel):
    action_id: str
    conservative_bound_m: str | None
    retained_length_m: str
    completed: bool
    reason: str
    label: str = 'Conservative model bound'
    tested_subsets: int = 0
    oracle_lower_bound_m: str | None = None
    relaxation: str = 'Exact rational McCormick outer relaxation; SAT may be spurious'
