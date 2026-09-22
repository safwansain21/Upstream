"""Environmental R4 collection adapter; canonical JSON/GeoJSON remain primary."""
import base64
import hashlib
import html
import json
import re
from decimal import Decimal
from urllib.parse import urlsplit

from .contracts import PackagePayload


def fhir_json(value) -> bytes:
    """Serialize finite Decimal directly as JSON numbers without float rounding."""
    def encode(item):
        if isinstance(item, Decimal):
            if not item.is_finite():
                raise ValueError("non-finite FHIR decimal")
            return format(item, "f")
        if isinstance(item, dict):
            return "{" + ",".join(json.dumps(k) + ":" + encode(v) for k, v in sorted(item.items())) + "}"
        if isinstance(item, list):
            return "[" + ",".join(encode(v) for v in item) + "]"
        return json.dumps(item, ensure_ascii=False, allow_nan=False)
    return encode(value).encode("utf-8")


def validate_references(bundle: dict) -> None:
    addresses = set()
    for entry in bundle["entry"]:
        resource = entry["resource"]
        address = entry["fullUrl"]
        if address in addresses:
            raise ValueError("duplicate resource address")
        addresses.add(address)
        addresses.add(address + "/_history/" + resource["meta"]["versionId"])
    def walk(value):
        if isinstance(value, dict):
            if "reference" in value and value["reference"] not in addresses:
                raise ValueError("unresolved FHIR reference: " + value["reference"])
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    walk(bundle)


def fhir_bundle(p: PackagePayload, base: str, assessment: bytes) -> dict:
    base = base.rstrip("/")
    url = urlsplit(base)
    if url.scheme not in {"https", "http"} or not url.netloc or url.query or url.fragment or url.username:
        raise ValueError("FHIR canonical base must be an absolute HTTP(S) URL")
    entries = []
    def fid(value):
        return value if re.fullmatch(r"[A-Za-z0-9.-]{1,64}", value) else hashlib.sha256(value.encode()).hexdigest()
    def address(kind, value):
        return f"{base}/{kind}/{fid(value)}"
    def ref(kind, value, version=None):
        uri = address(kind, value)
        return {"reference": uri + ("/_history/" + fid(version) if version else "")}
    def ext(name, value, datatype="String"):
        return {"url": base + "/StructureDefinition/" + name, "value" + datatype: value}
    def resource(kind, identity, resource_version, narrative, **fields):
        r = {"resourceType": kind, "id": fid(identity), "meta": {"versionId": fid(resource_version)},
             "text": {"status": "generated", "div": '<div xmlns="http://www.w3.org/1999/xhtml"><p>' + html.escape(narrative) + '</p></div>'}, **fields}
        entries.append({"fullUrl": address(kind, identity), "resource": r})
        return r
    def concept(code, display):
        return {"coding": [{"system": base + "/CodeSystem/environmental-measurement", "code": code, "display": display}], "text": display}
    resource("Organization", p.organization_id, "1", p.organization_name, name=p.organization_name)
    resource("Device", "upstream-exporter", "1", "Upstream environmental package exporter", deviceName=[{"name": "Upstream exporter", "type": "user-friendly-name"}], version=[{"value": p.versions.engine}])
    for instrument in sorted({o.instrument_id for o in p.observations}):
        resource("Device", "instrument-" + instrument, "1", "Environmental meter " + instrument,
                 identifier=[{"system": base + "/identifier/instrument", "value": instrument}])
    for station in p.stations:
        location = resource("Location", station.id, station.version, station.name, name=station.name,
                            identifier=[{"system": base + "/identifier/station", "value": station.id}],
                            extension=[ext("source-version", station.version)])
        if station.longitude is not None:
            location["position"] = {"longitude": Decimal(station.longitude), "latitude": Decimal(station.latitude)}
    names = {"raw": "Raw electrical conductivity", "meter_sc25": "Meter compensated specific conductance at 25 Cel", "true_sc25": "Specific conductance at 25 Cel"}
    for o in p.observations:
        extensions = [ext("origin", o.origin, "Code"), ext("quality", o.quality, "Code"),
                      ext("inclusion", o.inclusion, "Code"), ext("contributor-pseudonym", o.contributor_pseudonym),
                      ext("protocol-version", o.protocol_version), ext("calibration-version", o.calibration_version),
                      ext("source-version", o.version), ext("visit-id", o.visit_id), ext("source", o.source)]
        if o.compensation_description:
            extensions.append(ext("compensation", o.compensation_description))
        r = resource("Observation", o.id, o.version, names[o.mode] + ": " + o.value + " uS/cm; " + o.origin + "; quality " + o.quality,
                     status="final" if o.quality == "reviewed" else "preliminary", code=concept(o.mode, names[o.mode]),
                     identifier=[{"system": base + "/identifier/observation", "value": o.id}],
                     subject=ref("Location", o.station_id), device=ref("Device", "instrument-" + o.instrument_id),
                     effectiveDateTime=o.measured_at, issued=o.received_at,
                     valueQuantity={"value": Decimal(o.value), "unit": "µS/cm", "system": "http://unitsofmeasure.org", "code": "uS/cm"},
                     extension=extensions)
        r["meta"]["profile"] = [base + "/StructureDefinition/environmental-observation"]
        if o.temperature_c is not None:
            r["component"] = [{"code": concept("temperature", "Water temperature"), "valueQuantity": {"value": Decimal(o.temperature_c), "unit": "°C", "system": "http://unitsofmeasure.org", "code": "Cel"}}]
        if o.background_description:
            r["referenceRange"] = [{"text": "Empirical conditional background; not a healthy range. " + o.background_description}]
        if o.derived_from_id:
            r["derivedFrom"] = [ref("Observation", o.derived_from_id)]
    related = [ref("Location", s.id) for s in p.stations] + [ref("Observation", o.id) for o in p.observations]
    context = {"period": {"start": p.observation_start, "end": p.observation_end}}
    if related:
        context["related"] = related
    resource("DocumentReference", p.package_id, p.assessment_version, p.conclusion, status="current", docStatus="final",
             date=p.created_at, author=[ref("Organization", p.organization_id)], context=context,
             description="Environmental assessment; immutable publication snapshot",
             extension=[ext("source-version", p.assessment_version), ext("reviewer-pseudonym", p.reviewer_pseudonym)],
             content=[{"attachment": {"contentType": "application/json", "title": "assessment.json", "data": base64.b64encode(assessment).decode()}}])
    for o in p.observations:
        resource("Provenance", "reading-" + o.id, o.version, "Environmental reading attribution",
                 target=[ref("Observation", o.id, o.version)], recorded=o.received_at,
                 agent=[{"who": ref("Organization", p.organization_id), "extension": [ext("contributor-pseudonym", o.contributor_pseudonym)]}])
    resource("Provenance", "package-" + p.package_id, p.assessment_version, "Package review and export attribution",
             target=[ref("DocumentReference", p.package_id, p.assessment_version)], recorded=p.created_at,
             agent=[{"who": ref("Organization", p.organization_id), "extension": [ext("reviewer-pseudonym", p.reviewer_pseudonym)]}, {"who": ref("Device", "upstream-exporter")}])
    bundle = {"resourceType": "Bundle", "id": fid(p.package_id), "type": "collection", "timestamp": p.created_at, "entry": entries}
    validate_references(bundle)
    return bundle

