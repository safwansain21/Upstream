# FHIR R4 adapter validation

Validator: official HL7 `validator_cli.jar` 6.10.4, checksum-pinned in `exports/fhir/validator-lock.json`, FHIR 4.0.1,
core package `hl7.fhir.r4.core#4.0.1`, local profiles from `exports/fhir/conformance.py`, run with `-tx n/a` (no terminology
server). Command: `cd exports/fhir && python validate.py <bundle.json> [--download]`. The test
`tests/packages/test_fhir_official.py` builds a bundle from a real approved assessment and requires zero errors.

Result on 2026-09-22: 0 errors, 8 warnings, 1 information message.

## OneAquaHealth IG profiles

Stations are exported as **LocationOah** and quality-reviewed conductivity readings as **ObservationIndicatorsOah**, from
the OneAquaHealth FHIR Implementation Guide by HL7 Europe ([hl7-eu/oah](https://github.com/hl7-eu/oah)). Each reading keeps
Upstream's exact mode code (raw, meter SC25, true SC25) and also carries the IG's own concept
`temporarySystem-oah-eu#electrical-conductivity` in µS/cm, the same encoding the IG's examples use. The IG profile fixes
`status` to `final`, so unreviewed readings (exported as `preliminary`, history only) do not claim it. The IG requires a
performer: it is the organization responsible for the case; individual people stay pseudonymous extensions.

The IG has no published package, so `exports/fhir/oah_ig.py` fetches it at a pinned commit and compiles it with a pinned
SUSHI (both in `validator-lock.json`) into `exports/fhir/.cache/oah`; `validate.py --download` runs it, and `validate.py`
loads it whenever present. The IG source is not vendored because it carries no explicit licence.

Result on 2026-10-04 for the seeded approved Mill Brook package: 0 errors; 8 LocationOah stations and 3
ObservationIndicatorsOah readings checked against the IG; 3 warnings (the `uS/cm` terminology note below); information
messages that Upstream's own `source-version` extension is not one of the profile's named extension slices, which is
allowed. Conformance to the IG's profiles is not an integration with the OneAquaHealth Citizen Science App or its API.

## Warnings, each reviewed

- **"Best Practice Recommendation: In general, all observations should have a performer"** (one per Observation, before
  2026-10-04). Resolved: the responsible organization is now the performer, as the OneAquaHealth profile requires. Upstream
  still does not put individual people into FHIR as Practitioner/Patient resources; contributors stay pseudonymous extensions.
- **"Unable to validate code 'uS/cm' in system 'http://unitsofmeasure.org' because the validator is running without
  terminology services"**. Expected with `-tx n/a` (offline, no external calls). `uS/cm` is valid UCUM syntax; run with a
  terminology server to confirm in a connected environment.

## Semantic checks (asserted in tests)

No Patient, RelatedPerson, Practitioner, Condition or CarePlan resources; DocumentReference has no `subject` (Locations go in
`context.related`); raw and compensated readings are separate Observations linked with `derivedFrom`
(`tests/packages/test_fhir.py`); broken internal references are rejected. Validity does not prove interoperability with any
specific recipient system.
