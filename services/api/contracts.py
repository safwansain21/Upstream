"""HTTP inputs accept only user-editable facts, never derived authority."""
from datetime import datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class ReportCreate(StrictModel):
    client_id: UUID
    description: str = Field(default='', max_length=2000)
    categories: list[Literal['unusual_foam', 'colour_change', 'odour', 'dead_wildlife',
                            'visible_discharge', 'habitat_access', 'other']] = Field(default_factory=list, max_length=7)
    observed_at: datetime
    timezone: str
    landmark: str = Field(default='', max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, gt=0, le=100000)
    location_method: Literal['landmark', 'gps', 'manual', 'pin'] = 'landmark'
    location_precision: Literal['unresolved', 'approximate', 'confirmed'] = 'unresolved'
    local_name: str | None = Field(default=None, max_length=150)
    unmapped: bool = False
    waterway_id: UUID | None = None
    public_visibility: bool = False
    media_ids: list[UUID] = Field(default_factory=list, max_length=5)
    new_observation: bool = True

    @field_validator('timezone')
    @classmethod
    def valid_zone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError('Choose a valid IANA timezone')
        return value

    @model_validator(mode='after')
    def valid_observation(self):
        if not self.categories and len(self.description) < 10:
            raise ValueError('Select an observation category or provide at least 10 characters')
        if self.observed_at.tzinfo is None:
            raise ValueError('Observation time must include a timezone offset')
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError('Provide both latitude and longitude')
        if self.latitude is None:
            if not self.landmark:
                raise ValueError('Describe a landmark or provide coordinates')
            self.location_precision = 'unresolved'
        return self


class VersionedCommand(StrictModel):
    expected_version: int = Field(ge=1)
    reason: str = Field(default='', max_length=2000)


class TaskTransition(VersionedCommand):
    action: Literal['accept', 'decline', 'start', 'submit', 'complete', 'cancel', 'block', 'claim']
    outcome: str | None = Field(default=None, max_length=2000)

    @model_validator(mode='after')
    def reason_required(self):
        if self.action in {'decline', 'cancel', 'block', 'complete'} and len(self.reason) < 5:
            raise ValueError('Provide a reason of at least 5 characters')
        return self


class ProfilePatch(StrictModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    locale: str | None = Field(default=None, max_length=20)
    motion_preference: Literal['system', 'reduced', 'full'] | None = None
    simplify_map: bool | None = None


class ReviewCommand(VersionedCommand):
    action: Literal['approve', 'request_more', 'reject', 'exclude', 'accept', 'suspect']
    dependency_hash: str | None = None

    @model_validator(mode='after')
    def rationale(self):
        if len(self.reason) < 10:
            raise ValueError('Provide a review rationale of at least 10 characters')
        return self


class TaskCreate(StrictModel):
    case_id: UUID
    task_type: Literal['location_confirmation', 'mapping_verification', 'access_confirmation',
                       'repeat_imagery', 'baseline_reading', 'anchor_reading', 'conductance_reading',
                       'coordinated_pair', 'instrument_check', 'expert_review']
    purpose: str = Field(min_length=10, max_length=2000)
    station_id: UUID | None = None
    protocol_id: UUID | None = None
    window_start: datetime
    window_end: datetime
    estimated_minutes: int = Field(default=30, ge=1, le=1440)

    @model_validator(mode='after')
    def time_window(self):
        if not self.window_start.tzinfo or not self.window_end.tzinfo or self.window_end <= self.window_start:
            raise ValueError('Provide a timezone-aware increasing task window')
        return self


class Assignment(VersionedCommand):
    assignee_id: UUID
    instrument_id: UUID | None = None


class CaseDecision(VersionedCommand):
    action: Literal['inspection_recommended', 'escalated', 'closed_no_anomaly', 'closed_insufficient', 'triage']
    assessment_id: UUID | None = None
    segments: list[str] = Field(default_factory=list)
    context_sources: list[str] = Field(default_factory=list)
