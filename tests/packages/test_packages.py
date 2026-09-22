import copy
import hashlib
import json

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def api():
    from services import packages
    assert hasattr(packages, "build_package"), "evidence package builder is missing"
    return packages


def test_exports_share_version_geometry_origin_and_preserve_exact_values(payload):
    result = api().build_package(payload)
    assessment = json.loads(result.artifacts["assessment.json"])
    geo = json.loads(result.artifacts["evidence.geojson"])
    observations = json.loads(result.artifacts["observations.json"])
    assert assessment["assessment_version"] == geo["assessment_version"] == observations["assessment_version"] == "2"
    assert geo["features"][0]["geometry"] == payload["retained_segments"][0]["geometry"]
    assert geo["features"][0]["properties"]["compatibility"] == "unknown"
    assert geo["features"][0]["properties"]["origin"] == "synthetic"
    assert assessment["retained_length_km"] == "1.250"
    assert observations["observations"][0]["value"] == "400.250"
    assert assessment["upstream_extent_unresolved"] is True


def test_unsigned_manifest_hashes_every_artifact_is_immutable_and_deterministic(payload):
    p = api()
    first = p.build_package(payload)
    assert first.artifacts == p.build_package(payload).artifacts
    manifest = json.loads(first.artifacts["manifest.json"])
    assert manifest["signature"]["status"] == "unsigned"
    assert set(manifest["artifacts"]) == set(first.artifacts) - {"manifest.json"}
    for name, record in manifest["artifacts"].items():
        assert record["sha256"] == hashlib.sha256(first.artifacts[name]).hexdigest()
    with pytest.raises(TypeError):
        first.artifacts["assessment.json"] = b"changed"
    assert p.verify_package(first.artifacts)["signature_status"] == "unsigned"


def test_html_escapes_untrusted_prose_and_includes_review_and_limits(payload):
    payload["conclusion"] = '<script>fetch("https://evil.example")</script>'
    html = api().build_package(payload).artifacts["report.html"].decode()
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "expert-7" in html and "upstream extent unresolved" in html.lower()
    assert "1.250" in html and "synthetic" in html


@pytest.mark.parametrize("mutation", ["unknown", "float", "infinity", "negative", "bad_geometry", "bad_reference", "naive_time"])
def test_strict_boundary_rejects_ambiguous_or_invalid_inputs(payload, mutation):
    if mutation == "unknown": payload["simulator_truth"] = "hidden source"
    if mutation == "float": payload["observations"][0]["value"] = 4.5
    if mutation == "infinity": payload["observations"][0]["value"] = "Infinity"
    if mutation == "negative": payload["retained_segments"][0]["length_km"] = "-1"
    if mutation == "bad_geometry": payload["retained_segments"][0]["geometry"]["coordinates"][0][0] = 181
    if mutation == "bad_reference": payload["observations"][0]["station_id"] = "missing"
    if mutation == "naive_time": payload["created_at"] = "2026-09-21T12:00:00"
    with pytest.raises(ValueError): api().build_package(payload)


def test_signed_package_detects_tamper_wrong_key_missing_signature_and_wrong_predecessor(payload):
    p = api()
    key = Ed25519PrivateKey.generate()
    payload["predecessor_manifest_hash"] = "b" * 64
    package = p.build_package(payload, private_key=key, key_id="test-key")
    assert p.verify_package(package.artifacts, public_key=key.public_key(), expected_predecessor_hash="b" * 64)["signature_status"] == "verified"
    for name in ["assessment.json", "manifest.json"]:
        changed = dict(package.artifacts)
        changed[name] += b" "
        with pytest.raises(ValueError): p.verify_package(changed, public_key=key.public_key())
    with pytest.raises(ValueError): p.verify_package(package.artifacts, public_key=Ed25519PrivateKey.generate().public_key())
    with pytest.raises(ValueError): p.verify_package(package.artifacts, public_key=key.public_key(), expected_predecessor_hash="c" * 64)
    stripped = dict(package.artifacts)
    stripped.pop("manifest.jws")
    with pytest.raises(ValueError): p.verify_package(stripped, public_key=key.public_key())


def test_manifest_replacement_and_extra_files_fail_even_for_unsigned_packages(payload):
    p = api()
    package = p.build_package(payload)
    changed = dict(package.artifacts)
    changed["extra.txt"] = b"not covered"
    with pytest.raises(ValueError): p.verify_package(changed)
    with pytest.raises(ValueError): p.verify_package(package.artifacts, expected_manifest_hash="f" * 64)


def test_superseding_build_never_rewrites_old_signed_package(payload):
    p = api()
    key = Ed25519PrivateKey.generate()
    old = p.build_package(payload, private_key=key, key_id="key")
    preserved = dict(old.artifacts)
    payload.update(package_id="package-2", assessment_version="3", predecessor_manifest_hash=old.manifest_hash)
    p.build_package(payload, private_key=key, key_id="key")
    assert dict(old.artifacts) == preserved
