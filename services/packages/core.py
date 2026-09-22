"""Deterministic bytes, detached signatures and fail-closed integrity verification."""
import base64
import hashlib
import html
import json
from dataclasses import dataclass
from decimal import Decimal
from types import MappingProxyType
from typing import Callable, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .contracts import PackagePayload


def canonical_json(value) -> bytes:
    # Project canonical format v1: UTF-8, sorted keys, compact separators,
    # no NaN/Infinity, no ASCII escaping, no Unicode normalization, no final LF.
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def unb64(value: str) -> bytes:
    decoded = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
    if b64(decoded) != value:
        raise ValueError("noncanonical base64url")
    return decoded


def fingerprint(key: Ed25519PublicKey) -> str:
    return sha256(key.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw))


@dataclass(frozen=True)
class EvidencePackage:
    artifacts: Mapping[str, bytes]
    manifest_hash: str


def human_report(p: PackagePayload, assessment: dict, signed: bool) -> str:
    escape = lambda value: html.escape(str(value), quote=True)
    def section(title, values):
        if not isinstance(values, list):
            values = [values]
        return f"<section><h2>{escape(title)}</h2>" + "".join(f"<p>{escape(v)}</p>" for v in values) + "</section>"
    content = section("Reviewed conclusion", p.conclusion)
    content += section("Scope and origin", [p.case_scope, p.data_origin, f"{p.observation_start} to {p.observation_end}"])
    content += section("Retained channel", f"{assessment['retained_length_km']} km within the mapped domain" + ("; upstream extent unresolved" if p.upstream_extent_unresolved else ""))
    content += section("Retained segments and map geometry", [f"{s.id}: {s.length_km} km — {s.compatibility}; {s.origin}; {s.source}; WGS84 {s.geometry.coordinates}" for s in p.retained_segments])
    content += section("Legend", "Compatible and unknown segments are retained. Geometry is WGS84 longitude, latitude; channel length is supplied reviewed length, not a count of rows.")
    for title, values in [("Assumptions", p.assumptions), ("Unknowns", p.unknowns), ("Model limitations", p.limitations), ("Next action", p.next_action)]:
        content += section(title, values)
    content += section("Versions and review", [f"Assessment {p.assessment_id} version {p.assessment_version}", f"Reviewed by pseudonym {p.reviewer_pseudonym} at {p.reviewed_at}", str(p.versions.model_dump()), f"Problem SHA-256 {p.problem_hash}", f"Predecessor manifest: {p.predecessor_manifest_hash or 'none'}"])
    content += section("Evidence and quality", [f"{o.id} version {o.version}; {o.value} {o.unit}; {o.mode}; {o.origin}; QC {o.quality}; {o.inclusion}; contributor {o.contributor_pseudonym}; protocol {o.protocol_version}; calibration {o.calibration_version}" for o in p.observations])
    content += section("Verification", ["Signed with a detached Ed25519 JWS." if signed else "Unsigned package.", "Verify every artifact against manifest.json using the package verification CLI and an independently trusted key and predecessor hash. Integrity/key origin does not prove scientific correctness."])
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Upstream evidence report</title><style>body{font:14px sans-serif;line-height:1.5;max-width:850px;margin:40px auto;color:#17252b}h1,h2{break-after:avoid}p{overflow-wrap:anywhere}section{margin:24px 0}@page{size:A4;margin:18mm}</style></head><body><h1>Upstream environmental evidence</h1>' + content + "</body></html>"


def build_package(payload: dict | PackagePayload, *, private_key: Ed25519PrivateKey | None = None,
                  key_id: str | None = None, include_fhir: bool = False,
                  fhir_base: str = "https://upstream.example/fhir",
                  pdf_renderer: Callable[[str], bytes] | None = None) -> EvidencePackage:
    # Revalidate model input too: callers cannot bypass the boundary with model_construct.
    p = PackagePayload.model_validate(payload.model_dump() if isinstance(payload, PackagePayload) else payload)
    if (private_key is None) != (key_id is None) or key_id == "":
        raise ValueError("signing requires both private key and key ID")
    assessment = p.model_dump(exclude={"observations"})
    assessment["retained_length_km"] = str(sum((Decimal(s.length_km) for s in p.retained_segments), Decimal(0)))
    common = {"assessment_id": p.assessment_id, "assessment_version": p.assessment_version, "data_origin": p.data_origin}
    geo = {"type": "FeatureCollection", **common, "assumptions": p.assumptions, "upstream_extent_unresolved": p.upstream_extent_unresolved,
           "features": [{"type": "Feature", "id": s.id, "geometry": s.geometry.model_dump(), "properties": s.model_dump(exclude={"geometry"})} for s in p.retained_segments]}
    report = human_report(p, assessment, private_key is not None)
    artifacts = {"assessment.json": canonical_json(assessment), "observations.json": canonical_json({**common, "observations": [o.model_dump() for o in p.observations]}),
                 "evidence.geojson": canonical_json(geo), "report.html": report.encode()}
    if pdf_renderer is not None:
        pdf = pdf_renderer(report)
        if not isinstance(pdf, bytes) or not pdf.startswith(b"%PDF-"):
            raise ValueError("renderer did not produce a PDF")
        artifacts["report.pdf"] = pdf
    if include_fhir:
        from .fhir import fhir_bundle, fhir_json
        artifacts["bundle.fhir.json"] = fhir_json(fhir_bundle(p, fhir_base, artifacts["assessment.json"]))
    signature = {"status": "unsigned"} if private_key is None else {"status": "signed", "algorithm": "EdDSA", "curve": "Ed25519", "key_id": key_id, "public_key_sha256": fingerprint(private_key.public_key())}
    manifest = {"format": "upstream-evidence-manifest-v1", "canonicalization": "upstream-json-v1", "package_id": p.package_id,
                **common, "created_at": p.created_at, "predecessor_manifest_hash": p.predecessor_manifest_hash,
                "signature": signature, "artifacts": {name: {"sha256": sha256(data), "size": len(data)} for name, data in artifacts.items()}}
    encoded = canonical_json(manifest)
    artifacts["manifest.json"] = encoded
    if private_key is not None:
        protected = b64(canonical_json({"alg": "EdDSA", "kid": key_id, "typ": "JOSE"}))
        signature_bytes = private_key.sign(f"{protected}.{b64(encoded)}".encode("ascii"))
        artifacts["manifest.jws"] = f"{protected}..{b64(signature_bytes)}".encode("ascii")
    return EvidencePackage(MappingProxyType(artifacts), sha256(encoded))


def verify_package(artifacts: Mapping[str, bytes], *, public_key: Ed25519PublicKey | None = None,
                   expected_manifest_hash: str | None = None, expected_predecessor_hash: str | None = None,
                   require_signature: bool = False) -> dict:
    try:
        encoded = artifacts["manifest.json"]
        manifest = json.loads(encoded)
        if canonical_json(manifest) != encoded or manifest["format"] != "upstream-evidence-manifest-v1":
            raise ValueError("invalid manifest format or canonicalization")
        if expected_manifest_hash is not None and sha256(encoded) != expected_manifest_hash:
            raise ValueError("replaced manifest")
        if expected_predecessor_hash is not None and manifest["predecessor_manifest_hash"] != expected_predecessor_hash:
            raise ValueError("broken predecessor link")
        signed = manifest["signature"]["status"] == "signed"
        expected_files = set(manifest["artifacts"]) | {"manifest.json"} | ({"manifest.jws"} if signed else set())
        if set(artifacts) != expected_files or {"manifest.json", "manifest.jws"} & set(manifest["artifacts"]):
            raise ValueError("unlisted or missing artifacts")
        for name, record in manifest["artifacts"].items():
            if "/" in name or "\\" in name or name.startswith("."):
                raise ValueError("invalid artifact name")
            if sha256(artifacts[name]) != record["sha256"] or len(artifacts[name]) != record["size"]:
                raise ValueError("artifact integrity failure")
        if not signed:
            if require_signature or public_key is not None or manifest["signature"] != {"status": "unsigned"}:
                raise ValueError("signature required")
            status = "unsigned"
        else:
            if public_key is None:
                raise ValueError("trusted verification key required")
            protected, detached, sig = artifacts["manifest.jws"].decode("ascii").split(".")
            header = json.loads(unb64(protected))
            if detached or header != {"alg": "EdDSA", "kid": manifest["signature"]["key_id"], "typ": "JOSE"}:
                raise ValueError("invalid detached JWS")
            if manifest["signature"]["algorithm"] != "EdDSA" or manifest["signature"]["curve"] != "Ed25519" or manifest["signature"]["public_key_sha256"] != fingerprint(public_key):
                raise ValueError("wrong signing key")
            public_key.verify(unb64(sig), f"{protected}.{b64(encoded)}".encode("ascii"))
            status = "verified"
        return {"manifest_hash": sha256(encoded), "signature_status": status, "package_id": manifest["package_id"], "predecessor_manifest_hash": manifest["predecessor_manifest_hash"]}
    except (KeyError, TypeError, UnicodeError, json.JSONDecodeError, InvalidSignature) as exc:
        raise ValueError("invalid evidence package") from exc
