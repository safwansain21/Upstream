"""Allowlisted environmental export boundary; no engine objects or arbitrary metadata."""
import math
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, AfterValidator, model_validator


def finite_decimal(value: str) -> str:
    number = Decimal(value)
    if not number.is_finite() or len(value) > 80:
        raise ValueError("finite bounded decimal string required")
    return value


def nonnegative(value: str) -> str:
    if Decimal(value) < 0:
        raise ValueError("negative environmental quantity")
    return value


def aware_time(value: str) -> str:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("timestamp must retain timezone")
    return value


Text = Annotated[str, Field(min_length=1, max_length=10000)]
Identifier = Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$")]
DecimalString = Annotated[str, AfterValidator(finite_decimal)]
Nonnegative = Annotated[DecimalString, AfterValidator(nonnegative)]
Timestamp = Annotated[str, AfterValidator(aware_time)]
Hash = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Origin = Literal["real", "synthetic", "replayed"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class Geometry(StrictModel):
    type: Literal["LineString"]
    coordinates: list[list[float]] = Field(min_length=2, max_length=10000)

    @model_validator(mode="after")
    def coordinates_valid(self):
        for point in self.coordinates:
            if len(point) != 2 or not all(math.isfinite(v) for v in point):
                raise ValueError("longitude/latitude pair required")
            if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
                raise ValueError("coordinate outside WGS84 domain")
        return self


class Segment(StrictModel):
    id: Identifier
    length_km: Nonnegative
    geometry: Geometry
    origin: Origin
    source: Text
    compatibility: Literal["compatible", "unknown"]


class Station(StrictModel):
    id: Identifier
    version: Identifier
    name: Text
    longitude: DecimalString | None = None
    latitude: DecimalString | None = None

    @model_validator(mode="after")
    def position_valid(self):
        if (self.longitude is None) != (self.latitude is None):
            raise ValueError("position must be wholly known or unknown")
        if self.longitude is not None and not (-180 <= Decimal(self.longitude) <= 180 and -90 <= Decimal(self.latitude) <= 90):
            raise ValueError("station outside WGS84 domain")
        return self


class Observation(StrictModel):
    id: Identifier
    version: Identifier
    station_id: Identifier
    instrument_id: Identifier
    visit_id: Identifier
    contributor_pseudonym: Identifier
    measured_at: Timestamp
    received_at: Timestamp
    value: Nonnegative
    unit: Literal["uS/cm"]
    mode: Literal["raw", "meter_sc25", "true_sc25"]
    temperature_c: DecimalString | None = None
    quality: Literal["unreviewed", "reviewed", "suspect", "rejected"]
    inclusion: Literal["included", "excluded", "history_only"]
    origin: Origin
    protocol_version: Identifier
    calibration_version: Identifier
    source: Text
    compensation_description: Text | None = None
    background_description: Text | None = None
    derived_from_id: Identifier | None = None

    @model_validator(mode="after")
    def measurement_semantics(self):
        if self.inclusion == "included" and self.quality != "reviewed":
            raise ValueError("included observation requires reviewed quality")
        if self.mode != "raw" and self.inclusion == "included" and self.compensation_description is None:
            raise ValueError("included compensated measurement requires documented semantics")
        return self


class Versions(StrictModel):
    network: Identifier
    protocol: Identifier
    background: Identifier
    transport: Identifier
    engine: Identifier


class PackagePayload(StrictModel):
    package_id: Identifier
    case_id: Identifier
    assessment_id: Identifier
    assessment_version: Identifier
    organization_id: Identifier
    organization_name: Text
    created_at: Timestamp
    reviewed_at: Timestamp
    reviewer_pseudonym: Identifier
    data_origin: Origin
    case_scope: Text
    observation_start: Timestamp
    observation_end: Timestamp
    conclusion: Text
    assumptions: list[Text] = Field(min_length=1, max_length=100)
    unknowns: list[Text] = Field(max_length=100)
    limitations: list[Text] = Field(min_length=1, max_length=100)
    next_action: Text
    versions: Versions
    problem_hash: Hash
    upstream_extent_unresolved: bool
    retained_segments: list[Segment] = Field(max_length=10000)
    stations: list[Station] = Field(max_length=10000)
    observations: list[Observation] = Field(max_length=10000)
    predecessor_manifest_hash: Hash | None = None

    @model_validator(mode="after")
    def references_and_period(self):
        for collection in (self.retained_segments, self.stations, self.observations):
            if len({x.id for x in collection}) != len(collection):
                raise ValueError("duplicate stable ID")
        station_ids = {x.id for x in self.stations}
        readings = {x.id: x for x in self.observations}
        for reading in self.observations:
            if reading.station_id not in station_ids:
                raise ValueError("unresolved station reference")
            if reading.derived_from_id is not None:
                original = readings.get(reading.derived_from_id)
                if original is None or original.mode != "raw" or reading.mode == "raw" or original.station_id != reading.station_id:
                    raise ValueError("derived reading must reference raw reading at same station")
        start = datetime.fromisoformat(self.observation_start.replace("Z", "+00:00"))
        end = datetime.fromisoformat(self.observation_end.replace("Z", "+00:00"))
        if start > end:
            raise ValueError("reversed observation period")
        return self
