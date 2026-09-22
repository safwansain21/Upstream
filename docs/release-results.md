# Release results

Date: 2026-09-21. Build in progress. FAIL means not yet implemented or not yet run; it is not a passing claim.
Local infrastructure checks cannot be marked BLOCKED_EXTERNAL.

| ID | Result | Command / procedure | Evidence |
|---|---|---|---|
| A01 | FAIL | Not run yet | None |
| A02 | FAIL | Not run yet | None |
| A03 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: e2e reload of the directory (test_directory_requires_sign_in_and_lists_example_cases); other required routes not built/tested yet. |
| A04 | FAIL | Not run yet | None |
| A05 | FAIL | Not run yet | None |
| A06 | FAIL | Not run yet | None |
| A07 | FAIL | Not run yet | None |
| A08 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: fresh `supabase db reset --local` applies all migrations and the seed; upgrade from a prior schema not tested. |
| B01 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/e2e/test_report_flow.py::test_guest_landmark_report_survives_sign_in_and_opens_one_case |
| B02 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_http.py::test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent; tests/e2e/test_report_flow.py::test_guest_landmark_report_survives_sign_in_and_opens_one_case |
| B03 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_http.py::test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent; tests/e2e/test_report_flow.py::test_guest_landmark_report_survives_sign_in_and_opens_one_case |
| B04 | FAIL | Not run yet | None |
| B05 | FAIL | Not run yet | None |
| B06 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_http.py::test_upload_rejects_disguised_and_oversized_images; tests/e2e/test_report_flow.py::test_guest_landmark_report_survives_sign_in_and_opens_one_case; tests/e2e/test_report_flow.py::test_signed_in_photo_report_uploads_then_submits |
| B07 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_http.py::test_photo_upload_strips_location_and_attaches_to_report |
| B08 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_http.py::test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent |
| B09 | FAIL | Not run yet | None |
| B10 | FAIL | Not run yet | None |
| B11 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: device-saved vs server-received shown in form and receipt; uploading/offline states not browser-tested. |
| B12 | FAIL | Not run yet | None |
| B13 | FAIL | Not run yet | None |
| B14 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: default private asserted (test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent); cross-record exposure not tested. |
| B15 | FAIL | Not run yet | None |
| C01 | FAIL | Not run yet | None |
| C02 | FAIL | Not run yet | None |
| C03 | FAIL | Not run yet | None |
| C04 | FAIL | Not run yet | None |
| C05 | FAIL | Not run yet | None |
| C06 | FAIL | Not run yet | None |
| C07 | FAIL | Not run yet | None |
| C08 | FAIL | Not run yet | None |
| C09 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: test_readiness_reports_missing_prerequisites_independently covers mapping/flow-regime checks only. |
| C10 | FAIL | Not run yet | None |
| C11 | FAIL | Not run yet | None |
| C12 | FAIL | Not run yet | None |
| D01 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_assignment_checks_qualification_instrument_version_and_limitations; tests/e2e/test_task_flow.py::test_task_proposal_assignment_capture_and_review |
| D02 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_two_claims_yield_one_assignment_and_one_conflict |
| D03 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_concurrent_instrument_bookings_admit_one |
| D04 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_decline_requires_reason_and_keeps_case_usable |
| D05 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_qualification_is_checked_at_measurement_time |
| D06 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_conductivity_modes_are_explicit_and_units_round_trip; tests/api/test_field_work.py::test_missing_metadata_meter_sc25_and_calibration_are_history_only |
| D07 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_missing_metadata_meter_sc25_and_calibration_are_history_only |
| D08 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_replicates_are_individual_and_idempotent; tests/engine/test_properties.py::test_raw_shared_scopes_and_independent_compensation; tests/e2e/test_task_flow.py::test_task_proposal_assignment_capture_and_review |
| D09 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_reading_stays_valid_after_calibration_expires; tests/api/test_field_work.py::test_calibration_events_are_append_only_and_expert_recorded |
| D10 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: held-for-review reason asserted (test_missing_metadata_meter_sc25_and_calibration_are_history_only); audit entry not asserted. |
| D11 | FAIL | Not run yet | None |
| D12 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_missing_metadata_meter_sc25_and_calibration_are_history_only |
| D13 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_access_closure_blocks_tasks_and_assignment |
| D14 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_field_work.py::test_assignment_checks_qualification_instrument_version_and_limitations; tests/e2e/test_task_flow.py::test_task_proposal_assignment_capture_and_review |
| E01 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_graph_signatures_and_lengths |
| E02 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_graph_signatures_and_lengths |
| E03 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_graph_signatures_and_lengths; tests/api/test_analysis.py::test_readiness_reports_missing_prerequisites_independently |
| E04 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_independent_fraction_oracle; tests/engine/test_science.py::test_real_solver_canonical_arithmetic[None-5300]; tests/api/test_analysis.py::test_worker_computes_fixture_assessment_and_conservative_plan |
| E05 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_removing_evidence_restores_candidates |
| E06 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_real_solver_canonical_arithmetic[high-2300]; tests/engine/test_science.py::test_real_solver_canonical_arithmetic[low-3000] |
| E07 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_removing_evidence_restores_candidates |
| E08 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: 105/23 (test_independent_fraction_oracle) and U=5 bound 5300 (test_planner_ambiguous_outcomes_and_budget_safety); equality case not asserted. |
| E09 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_background.py::test_raw_background_propagation_and_compensation_regression |
| E10 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_properties.py::test_generated_converging_graph_truth_retention; tests/engine/test_science.py::test_unknown_and_missing_readiness_never_excludes |
| E11 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_properties.py::test_widening_bounds_and_removing_evidence_preserve_feasible_classes; tests/engine/test_science.py::test_unknown_and_missing_readiness_never_excludes |
| E12 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_properties.py::test_raw_shared_scopes_and_independent_compensation; tests/engine/test_properties.py::test_delimiter_collisions_cannot_merge_distinct_reading_errors |
| E13 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_unknown_and_missing_readiness_never_excludes; tests/engine/test_properties.py::test_negative_event_is_conflict_and_resource_failure_retains |
| E14 | FAIL | Not run yet | None |
| E15 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_real_solver_canonical_arithmetic[None-5300]; tests/engine/test_science.py::test_canonical_hash_deduplicates_and_orders_readings |
| E16 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_planner_ambiguous_outcomes_and_budget_safety |
| E17 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_properties.py::test_exact_products_are_inside_mccormick_envelopes; tests/engine/test_properties.py::test_generated_converging_graph_truth_retention |
| E18 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_properties.py::test_planner_oracle_and_resource_limits |
| E19 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_properties.py::test_planner_oracle_and_resource_limits; tests/engine/test_science.py::test_planner_ambiguous_outcomes_and_budget_safety |
| E20 | FAIL | Not run yet | None |
| E21 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_science.py::test_truth_ai_float_and_bad_intervals_rejected |
| E22 | FAIL | Not run yet | None |
| E23 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_readiness_and_precision.py::test_transport_bound_is_computed_from_paths_and_velocity |
| E24 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_properties.py::test_negative_event_is_conflict_and_resource_failure_retains |
| E25 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/engine/test_background.py::test_chronological_evaluation_freezes_fit_and_counts_independent_events |
| E26 | FAIL | Not run yet | None |
| E27 | FAIL | Not run yet | None |
| F01 | FAIL | Not run yet | None |
| F02 | FAIL | Not run yet | None |
| F03 | FAIL | Not run yet | None |
| F04 | FAIL | Not run yet | None |
| F05 | FAIL | Not run yet | None |
| F06 | FAIL | Not run yet | None |
| F07 | FAIL | Not run yet | None |
| F08 | FAIL | Not run yet | None |
| F09 | FAIL | Not run yet | None |
| F10 | FAIL | Not run yet | None |
| F11 | FAIL | Not run yet | None |
| F12 | FAIL | Not run yet | None |
| F13 | FAIL | Not run yet | None |
| F14 | FAIL | Not run yet | None |
| F15 | FAIL | Not run yet | None |
| F16 | FAIL | Not run yet | None |
| F17 | FAIL | Not run yet | None |
| G01 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_http.py::test_other_org_and_unknown_records_are_not_found; tests/security/test_database.py::test_cross_tenant_relationship_is_rejected |
| G02 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: another member gets 404 for private media (test_photo_upload_strips_location_and_attaches_to_report); internal evidence by ID not tested. |
| G03 | FAIL | Not run yet | None |
| G04 | FAIL | Not run yet | None |
| G05 | FAIL | Not run yet | None |
| G06 | PASS | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | tests/api/test_contracts.py::test_profile_cannot_upgrade_capabilities; tests/api/test_http.py::test_me_lists_capabilities_not_client_roles |
| G07 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: foreign Origin rejected (test_foreign_origin_rejected, test_origin_mismatch_rejected); unsafe HTML/prompt injection not tested. |
| G08 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: MIME mismatch and >40 MP rejected (test_upload_rejects_disguised_and_oversized_images); oversize import not tested. |
| G09 | FAIL | Not run yet | None |
| G10 | FAIL | Not run yet | None |
| G11 | FAIL | Not run yet | None |
| G12 | FAIL | Not run yet | None |
| H01 | FAIL | Not run yet | None |
| H02 | FAIL | Not run yet | None |
| H03 | FAIL | Not run yet | None |
| H04 | FAIL | Not run yet | None |
| H05 | FAIL | Not run yet | None |
| H06 | FAIL | Not run yet | None |
| H07 | FAIL | Not run yet | None |
| H08 | FAIL | Not run yet | None |
| H09 | FAIL | Not run yet | None |
| H10 | FAIL | Not run yet | None |
| H11 | FAIL | Not run yet | None |
| H12 | FAIL | Not run yet | None |
| I01 | FAIL | Not run yet | None |
| I02 | FAIL | Not run yet | None |
| I03 | FAIL | Not run yet | None |
| I04 | FAIL | Not run yet | None |
| I05 | FAIL | Not run yet | None |
| I06 | FAIL | Not run yet | None |
| I07 | FAIL | Not run yet | None |
| I08 | FAIL | Not run yet | None |
| I09 | FAIL | Not run yet | None |
| I10 | FAIL | Not run yet | None |
| I11 | FAIL | Not run yet | None |
| I12 | FAIL | Not run yet | None |
| I13 | FAIL | Not run yet | None |
| I14 | FAIL | Not run yet | None |
| I15 | FAIL | Not run yet | None |
| I16 | FAIL | Not run yet | None |
| I17 | FAIL | Not run yet | None |
| J01 | FAIL | Not run yet | None |
| J02 | FAIL | `.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` (local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21 | Partial: analysis runs in the worker off the request path (test_worker_computes_fixture_assessment_and_conservative_plan); cancellation not tested. |
| J03 | FAIL | Not run yet | None |
| J04 | FAIL | Not run yet | None |
| J05 | FAIL | Not run yet | None |
| J06 | FAIL | Not run yet | None |
| J07 | FAIL | Not run yet | None |
| J08 | FAIL | Not run yet | None |
| J09 | FAIL | Not run yet | None |
| J10 | FAIL | Not run yet | None |
| J11 | FAIL | Not run yet | None |
| J12 | FAIL | Not run yet | None |
