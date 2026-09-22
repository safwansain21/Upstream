import copy
import json
from decimal import Decimal

import pytest


def test_environmental_bundle_preserves_semantics_and_uses_correct_document_context(payload):
    from services.packages import build_package
    package = build_package(payload, include_fhir=True)
    bundle = json.loads(package.artifacts["bundle.fhir.json"], parse_float=Decimal)
    assert bundle["resourceType"] == "Bundle" and bundle["type"] == "collection"
    resources = [e["resource"] for e in bundle["entry"]]
    assert not {"Patient", "RelatedPerson", "Practitioner", "Condition", "CarePlan"} & {r["resourceType"] for r in resources}
    document = next(r for r in resources if r["resourceType"] == "DocumentReference")
    observation = next(r for r in resources if r["resourceType"] == "Observation")
    assert "subject" not in document
    assert document["context"]["related"]
    assert observation["valueQuantity"]["value"] == Decimal("400.250")
    assert observation["valueQuantity"]["code"] == "uS/cm"
    assert observation["component"][0]["valueQuantity"]["code"] == "Cel"
    assert "interpretation" not in observation
    extension_values = {x.get("valueCode") or x.get("valueString") for x in observation["extension"]}
    assert {"synthetic", "reviewed", "included", "contributor-8", "p3", "cal-2"} <= extension_values
    assert "empirical" in observation["referenceRange"][0]["text"].lower()
    assert all("/_history/" in ref["reference"] for r in resources if r["resourceType"] == "Provenance" for ref in r["target"])


def test_raw_and_compensated_readings_are_distinct_and_linked(payload):
    from services.packages import build_package
    derived = copy.deepcopy(payload["observations"][0])
    derived.update(id="reading-2", mode="meter_sc25", value="450.000", derived_from_id="reading-1", compensation_description="Meter documented coefficient 0.02 / Cel")
    payload["observations"].append(derived)
    bundle = json.loads(build_package(payload, include_fhir=True).artifacts["bundle.fhir.json"])
    readings = [e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Observation"]
    assert len(readings) == 2
    assert readings[1]["derivedFrom"][0]["reference"].endswith(readings[0]["id"])
    assert readings[0]["code"] != readings[1]["code"]


def test_fhir_reference_validation_rejects_broken_link(payload):
    from services.packages import build_package
    from services.packages.fhir import validate_references
    bundle = json.loads(build_package(payload, include_fhir=True).artifacts["bundle.fhir.json"])
    validate_references(bundle)
    bundle["entry"][-1]["resource"]["target"][0]["reference"] = "urn:uuid:missing"
    with pytest.raises(ValueError, match="unresolved"):
        validate_references(bundle)


def test_exact_decimal_version_attribution_and_custom_canonical_survive(payload):
    from services.packages import build_package
    payload["observations"][0].update(value="123456789.123456789123456789", version="v:2_test")
    bundle = json.loads(build_package(payload, include_fhir=True, fhir_base="https://example.org/environment").artifacts["bundle.fhir.json"], parse_float=Decimal)
    observation = next(e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Observation")
    assert observation["valueQuantity"]["value"] == Decimal("123456789.123456789123456789")
    assert observation["meta"]["profile"] == ["https://example.org/environment/StructureDefinition/environmental-observation"]
    assert {x["url"]: x.get("valueString") for x in observation["extension"]}["https://example.org/environment/StructureDefinition/source-version"] == "v:2_test"
    provenance = next(e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Provenance")
    assert provenance["target"][0]["reference"].endswith("/_history/" + observation["meta"]["versionId"])
