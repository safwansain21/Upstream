# Evidence packages — implementation checkpoint

2026-09-21: strict Pydantic payload contract, deterministic immutable artifact byte mapping, JSON/GeoJSON/escaped HTML, SHA-256 manifest, detached Ed25519 JWS and verification implemented. Thirteen tests passed with `.venv/Scripts/python.exe -m pytest tests/packages -q -p no:cacheprovider`.

Remaining work at this checkpoint: implement environmental FHIR adapter and semantic tests; optional network-blocked Playwright PDF; verification CLI; official pinned FHIR validator invocation and actual validation result. F12 is partial until actual PDF checked. F13/F14 are not passed. Other acceptance IDs still need application integration; pure functions do not establish storage, recipient authorization, delivery or immutable database behavior.

Public API: `from services.packages import PackagePayload, build_package, verify_package`.
`build_package(payload, private_key=None, key_id=None, include_fhir=False, fhir_base='https://upstream.example/fhir', pdf_renderer=None)` produces `EvidencePackage.artifacts` (immutable mapping of filenames to bytes) and `.manifest_hash`. Optional arguments are keyword-only. Supply an actual Ed25519 key object and key ID together. Retry delivery by reusing stored bytes; never regenerate a signed package.

`verify_package(artifacts, public_key=None, expected_manifest_hash=None, expected_predecessor_hash=None, require_signature=False)` returns integrity metadata or raises `ValueError`. Supplying a key requires a signature. Trust the public key and expected hashes independently; an unsigned package has integrity checks but no authenticity. A missing expected predecessor cannot establish chain continuity. Signed integrity is not scientific validation.

Payload schema is in `services/packages/contracts.py`, with a complete example fixture in `tests/packages/conftest.py`. Scientific quantities are exact finite decimal strings. Geometry is WGS84 display coordinates. No arbitrary metadata, simulator truth, clinical identities, private contributor names or unknown extra keys are accepted. Caller supplies reviewed scientific result and authorization; this subsystem does not approve evidence or infer eligibility.

Canonical manifest format `upstream-json-v1`: UTF-8 JSON, keys sorted lexicographically by Python Unicode code point, compact separators, no ASCII escaping or Unicode normalization, finite JSON numbers only, no trailing newline. This is a project format, not a claim of RFC 8785 conformance. Scientific decimals stay strings. Manifest is serialized once, hashes every delivered artifact except itself and its detached signature, and signs the normal base64url-encoded JWS payload (`protected + '.' + BASE64URL(manifest)`). Public-key fingerprint is SHA-256 over raw 32-byte Ed25519 public key.

Archived artifacts never mutate. Latest publication/supersession metadata belongs outside this byte set. Exporting invokes no delivery action and uses no network.
