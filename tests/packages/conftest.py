import pytest


@pytest.fixture
def payload():
    return {
        "package_id": "package-1", "case_id": "case-1", "assessment_id": "assessment-1",
        "assessment_version": "2", "organization_id": "org-1", "organization_name": "Example org",
        "created_at": "2026-09-21T12:00:00Z", "reviewed_at": "2026-09-21T11:00:00Z",
        "reviewer_pseudonym": "expert-7", "data_origin": "synthetic",
        "case_scope": "Reviewed local domain", "observation_start": "2026-09-20T10:00:00Z",
        "observation_end": "2026-09-20T12:00:00Z", "conclusion": "Conditional compatibility only",
        "assumptions": ["One sustained nonnegative input"], "unknowns": ["Boundary extent unresolved"],
        "limitations": ["Not pollutant identification or water safety"], "next_action": "Review boundary inflow",
        "versions": {"network": "n2", "protocol": "p3", "background": "b1", "transport": "t1", "engine": "e1"},
        "problem_hash": "a" * 64, "upstream_extent_unresolved": True,
        "retained_segments": [{"id": "reach-1", "length_km": "1.250", "geometry": {
            "type": "LineString", "coordinates": [[-71.1, 42.1], [-71.2, 42.2]]},
            "origin": "synthetic", "source": "Example fixture", "compatibility": "unknown"}],
        "stations": [{"id": "station-1", "version": "1", "name": "Example station", "longitude": "-71.1", "latitude": "42.1"}],
        "observations": [{"id": "reading-1", "version": "3", "station_id": "station-1", "instrument_id": "meter-1",
            "visit_id": "visit-1", "contributor_pseudonym": "contributor-8", "measured_at": "2026-09-20T11:00:00Z",
            "received_at": "2026-09-20T11:05:00Z", "value": "400.250", "unit": "uS/cm", "mode": "raw",
            "temperature_c": "18.5", "quality": "reviewed", "inclusion": "included", "origin": "synthetic",
            "protocol_version": "p3", "calibration_version": "cal-2", "source": "Example reading fixture",
            "background_description": "Empirical conditional coverage; not a healthy range"}],
    }
