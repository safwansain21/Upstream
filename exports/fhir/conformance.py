"""Generate local R4 definitions for the configured canonical base."""
import argparse
import json
from pathlib import Path


EXTENSIONS = {
    "origin": ("code", "Data origin: real, synthetic or replayed."),
    "quality": ("code", "Environmental quality review: unreviewed, reviewed, suspect or rejected; never clinical interpretation."),
    "inclusion": ("code", "Assessment selection: included, excluded or history_only."),
    "contributor-pseudonym": ("string", "Pseudonymous reading contributor; no clinical identity is asserted."),
    "reviewer-pseudonym": ("string", "Pseudonymous environmental reviewer; no clinical identity is asserted."),
    "source-version": ("string", "Exact source version. FHIR meta.versionId uses a SHA-256 identifier when source syntax is incompatible."),
    "protocol-version": ("string", "Exact environmental measurement protocol version."),
    "calibration-version": ("string", "Exact instrument calibration version."),
    "visit-id": ("string", "Source sampling visit identifier; not a clinical Encounter."),
    "source": ("string", "Source attribution of the environmental reading."),
    "compensation": ("string", "Documented temperature compensation semantics; does not imply model validity."),
}


def definitions(base):
    for name, (kind, description) in EXTENSIONS.items():
        url = base + "/StructureDefinition/" + name
        yield {"resourceType": "StructureDefinition", "id": name, "url": url, "version": "1.0.0",
               "name": "Upstream" + name.title().replace("-", ""), "status": "active", "experimental": False,
               "description": description, "fhirVersion": "4.0.1", "kind": "complex-type", "abstract": False,
               "context": [{"type": "element", "expression": "Element"}], "type": "Extension",
               "baseDefinition": "http://hl7.org/fhir/StructureDefinition/Extension", "derivation": "constraint",
               "differential": {"element": [{"id": "Extension", "path": "Extension", "short": description},
                    {"id": "Extension.extension", "path": "Extension.extension", "max": "0"},
                    {"id": "Extension.url", "path": "Extension.url", "fixedUri": url},
                    {"id": "Extension.value[x]", "path": "Extension.value[x]", "min": 1, "type": [{"code": kind}]}]}}
    yield {"resourceType": "CodeSystem", "id": "environmental-measurement", "url": base + "/CodeSystem/environmental-measurement",
           "version": "1.0.0", "name": "UpstreamEnvironmentalMeasurement", "status": "active", "experimental": False,
           "description": "Local environmental codes; no HL7 endorsement or LOINC equivalence is claimed.",
           "caseSensitive": True, "content": "complete", "concept": [
               {"code": "raw", "display": "Raw electrical conductivity"},
               {"code": "meter_sc25", "display": "Meter compensated specific conductance at 25 Cel"},
               {"code": "true_sc25", "display": "Specific conductance at 25 Cel"},
               {"code": "temperature", "display": "Water temperature"}]}
    yield {"resourceType": "StructureDefinition", "id": "environmental-observation", "url": base + "/StructureDefinition/environmental-observation",
           "version": "1.0.0", "name": "UpstreamEnvironmentalObservation", "status": "active", "experimental": False,
           "description": "Station conductivity with optional measured temperature component. Environmental evidence, not clinical care.",
           "fhirVersion": "4.0.1", "kind": "resource", "abstract": False, "type": "Observation",
           "baseDefinition": "http://hl7.org/fhir/StructureDefinition/Observation", "derivation": "constraint",
           "differential": {"element": [
               {"id": "Observation.subject", "path": "Observation.subject", "min": 1, "type": [{"code": "Reference", "targetProfile": ["http://hl7.org/fhir/StructureDefinition/Location"]}]},
               {"id": "Observation.value[x]", "path": "Observation.value[x]", "min": 1, "type": [{"code": "Quantity"}]},
               {"id": "Observation.interpretation", "path": "Observation.interpretation", "max": "0"}]}}


def write_definitions(folder, base):
    folder.mkdir(parents=True, exist_ok=True)
    for definition in definitions(base.rstrip("/")):
        (folder / (definition["id"] + ".json")).write_text(json.dumps(definition, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="https://upstream.example/fhir")
    parser.add_argument("--out", type=Path, default=Path("exports/fhir/profiles"))
    args = parser.parse_args()
    write_definitions(args.out, args.base)
