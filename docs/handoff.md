# Handoff report (J12)

Date: 2026-09-22. Branch `build/upstream`. Everything below was run on one Windows 11 laptop against the local Docker
Supabase stack. Gate-by-gate evidence (the exact command and the passing test node IDs) is in `docs/release-results.md`.

Upstream has not been validated in the field. All scientific results so far come from synthetic networks, synthetic readings
and a synthetic simulator. Passing tests show that the software behaves as specified. They do not show that the
environmental model is right for any real stream.

## Final run

`.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` on a freshly reset database (`supabase db reset --local`,
`scripts/seed_example.py`, `scripts/seed_load.py`), with the API, worker and `next start` running: 224 passed, 2 skipped, 2026-09-22.
The two skipped tests are destructive and run only with `UPSTREAM_RUN_DESTRUCTIVE=1` (A01 fresh checkout, A08 upgrade); each
passed in its own recorded run (see the A01 and A08 rows).

## Tests that exist

| Area | Files | What they exercise |
|---|---|---|
| Scientific engine (36) | `tests/engine/test_science.py`, `tests/engine/test_properties.py`, `tests/engine/test_background.py`, `tests/engine/test_readiness_and_precision.py`, `tests/engine/test_threshold_equality.py`, `tests/engine/test_topology_and_limits.py`, `tests/engine/test_evaluation.py` | Exact (Z3, rational) compatibility, generated-graph property tests, background propagation, planner bounds, threshold equality, topology changes, solver limits, and the paired policy evaluation |
| API and database (95) | `tests/api/test_http.py`, `tests/api/test_contracts.py`, `tests/api/test_analysis.py`, `tests/api/test_field_work.py`, `tests/api/test_mapping.py`, `tests/api/test_review.py`, `tests/api/test_exports.py`, `tests/api/test_receipts.py`, `tests/api/test_membership.py`, `tests/api/test_bootstrap.py`, `tests/api/test_durability.py`, `tests/api/test_readiness_checks.py`, `tests/api/test_gates_misc.py`, `tests/api/test_public_and_cancel.py`, `tests/api/test_context.py`, `tests/api/test_ai.py`, `tests/api/test_webhooks.py` | Real RPCs and RLS against local Postgres: reports, tasks, readings, network import and publication, review and approval, exports, delivery and acknowledgment, receipts, memberships, worker durability, context layers, the AI adapter (fake provider only) and signed webhooks (local receiver) |
| Browser (52) | `tests/e2e/test_report_flow.py`, `tests/e2e/test_task_flow.py`, `tests/e2e/test_review_flow.py`, `tests/e2e/test_export_flow.py`, `tests/e2e/test_receipts_flow.py`, `tests/e2e/test_map_setup.py`, `tests/e2e/test_offline.py`, `tests/e2e/test_routes.py`, `tests/e2e/test_route_states.py`, `tests/e2e/test_gates_ui.py`, `tests/e2e/test_responsive_a11y.py`, `tests/e2e/test_performance.py` | Headless Chromium through Playwright against `next start`: every workflow, offline drafts and readings, route states, automated accessibility (axe), reflow, reduced motion, and performance budgets |
| Evidence packages and FHIR (21) | `tests/packages/test_packages.py`, `tests/packages/test_fhir.py`, `tests/packages/test_fhir_official.py`, `tests/packages/test_pdf_cli.py`, `tests/packages/test_validator_runner.py` | Signed manifests, tamper detection, PDF rendering without remote requests, FHIR semantics, and the official HL7 validator (0 errors; warnings in `docs/fhir-validation.md`) |
| Security (12) | `tests/security/test_boundaries.py`, `tests/security/test_database.py`, `tests/security/test_secrets.py` | Direct REST/RPC bypass attempts, RLS on every table, cross-tenant references, log hygiene, secrets absent from the browser build |
| Operations and documentation (9) | `tests/migrations/test_upgrade.py`, `tests/migrations/test_fresh_checkout.py`, `tests/ops/test_backup_restore.py`, `tests/test_docs.py`, `tests/test_content_audit.py` | Upgrade from an earlier schema, fresh clone plus README commands, backup and isolated restore drill, runbook and README coverage, route scope and placeholder audit |

## Integrations not available or not verified

- **AI description assistance:** off by default. The OpenAI Responses adapter has only been tested against a local fake provider, never against the real service.
- **Background map provider:** OpenFreeMap (Liberty style) by default. It needs no key, account or payment and has no service-level agreement. Browser tests that open a map need internet access to `tiles.openfreemap.org`. A tile outage and a full provider outage are both simulated (H07); a real outage has not been observed.
- **Place search / geocoding:** not built. No geocoder is called.
- **Email:** only the local Supabase mail catcher has been used. No production SMTP provider has been tested.
- **Recipient webhooks:** tested against a local HTTP receiver, which is allowed only outside production. The HTTPS path (a request to the checked address with the configured host as SNI) is tested with a mocked transport. No real HTTPS recipient endpoint has been used.
- **Hosted Supabase and production deployment:** never deployed. Provider backups and point-in-time recovery were not exercised; the backup drill restores into a second local stack.
- **Package signing:** a local development Ed25519 key. Production key custody and a live rotation have not been exercised (the procedure is in `docs/runbook.md`).
- **FHIR recipients:** bundles pass the official validator locally. No FHIR server or recipient system has received one.
- **Live status streaming:** none. Analysis status is polled (H11 covers late and repeated poll responses).

## Empirical limits

- **Performance** (`docs/performance.md`): one laptop over loopback. Mobile LCP is 2.35-2.38 s against a 2.5 s budget (about 120 ms headroom). Directory API p95 is 86 ms on 10,000 synthetic cases. The map is ready in under 10 s with 600 located cases.
- **Solver:** 2 s per class and 30 s per job by default (hard caps 10 s and 120 s). Hitting a limit leaves classes unresolved and retained, never excluded, so large or ambiguous cases can stay unresolved.
- **Policy evaluation** (`docs/evaluation.md`): 60 synthetic episodes per scenario, which is pilot size.
  - With every bound true, no policy wrongly excluded the source.
  - With one deliberately misspecified background, the planner wrongly excluded the source in 10 of 60 episodes and random order in 12 of 60. The model-conflict flag caught only some of those episodes.
  - Exact inference is only as good as the protocol bounds.
- **Browsers and devices:** Chromium only, at emulated viewports and network profiles. No Firefox, Safari or physical mobile devices. Offline sync runs only while Upstream is open (no background sync).
- **Accessibility:** automated axe scans, keyboard-only reporting and a reduced-motion check. No manual screen-reader audit or full keyboard audit (the I gates).

## Gates not passing

- I01, I02, I03, I04, I05, I06, I07, I08, I09, I10, I11, I12, I13, I14, I17: visual, interaction and accessibility gates left for the later UI pass. Some have partial automated coverage, described in their rows.
