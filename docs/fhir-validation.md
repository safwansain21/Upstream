# FHIR R4 adapter validation

Validator: official HL7 `validator_cli.jar` 6.10.4, checksum-pinned in `exports/fhir/validator-lock.json`, FHIR 4.0.1,
core package `hl7.fhir.r4.core#4.0.1`, local profiles from `exports/fhir/conformance.py`, run with `-tx n/a` (no terminology
server). Command: `cd exports/fhir && python validate.py <bundle.json> [--download]`. The test
`tests/packages/test_fhir_official.py` builds a bundle from a real approved assessment and requires zero errors.

Result on 2026-09-22: 0 errors, 8 warnings, 1 information message.

## Warnings, each reviewed

- **"Best Practice Recommendation: In general, all observations should have a performer"** (one per Observation).
  Deliberate: Upstream does not put individual people into FHIR as Practitioner/Patient resources. Attribution is kept as a
  pseudonymous contributor extension and in the package's observations.json; the instrument is referenced as a Device.
  Adding an Organization performer is possible once a recipient agreement says which organization should appear.
- **"Unable to validate code 'uS/cm' in system 'http://unitsofmeasure.org' because the validator is running without
  terminology services"**. Expected with `-tx n/a` (offline, no external calls). `uS/cm` is valid UCUM syntax; run with a
  terminology server to confirm in a connected environment.

## Semantic checks (asserted in tests)

No Patient, RelatedPerson, Practitioner, Condition or CarePlan resources; DocumentReference has no `subject` (Locations go in
`context.related`); raw and compensated readings are separate Observations linked with `derivedFrom`
(`tests/packages/test_fhir.py`); broken internal references are rejected. Validity does not prove interoperability with any
specific recipient system.
