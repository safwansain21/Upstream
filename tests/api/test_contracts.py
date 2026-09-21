from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from services.api.contracts import ReportCreate, TaskTransition, ProfilePatch
from services.api.security import verify_origin, validate_webhook_url, DomainError


def report(**changes):
    return ReportCreate.model_validate({
        'client_id': str(uuid4()), 'description': 'Foam beside the footbridge',
        'observed_at': datetime.now(timezone.utc).isoformat(), 'timezone': 'America/New_York',
        'landmark': 'Footbridge at the park', **changes,
    })


def test_landmark_only_report_is_valid_and_private():
    r = report()
    assert r.latitude is None and r.waterway_id is None
    assert r.public_visibility is False
    assert r.location_precision == 'unresolved'


@pytest.mark.parametrize('changes', [
    {'description': 'short'}, {'description': 'x' * 2001}, {'timezone': 'Made/Up'},
    {'latitude': 45}, {'latitude': 91, 'longitude': 0},
    {'source_probability': '0.9'}, {'data_origin': 'synthetic'},
])
def test_report_rejects_invalid_or_privileged_input(changes):
    with pytest.raises(ValidationError):
        report(**changes)


def test_structured_category_allows_text_optional_report():
    assert report(description='', categories=['unusual_foam']).categories == ['unusual_foam']


def test_profile_cannot_upgrade_capabilities():
    with pytest.raises(ValidationError):
        ProfilePatch.model_validate({'display_name': 'Name', 'capabilities': ['expert']})


def test_decline_requires_reason():
    with pytest.raises(ValidationError):
        TaskTransition(action='decline', expected_version=1)


def test_origin_mismatch_rejected():
    with pytest.raises(DomainError):
        verify_origin('https://attacker.example', 'https://upstream.example')
    verify_origin('https://upstream.example', 'https://upstream.example')


@pytest.mark.parametrize('url', ['http://example.com', 'https://127.0.0.1', 'https://[::1]',
                               'https://169.254.169.254/latest', 'https://user:pass@example.com'])
def test_unsafe_webhook_destinations_rejected(url):
    with pytest.raises(DomainError):
        validate_webhook_url(url, resolved_ips=['127.0.0.1'])
