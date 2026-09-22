"""Record acceptance-gate evidence in docs/release-results.md.

PASS only with the exact command and the passing test node IDs. Partially covered gates stay FAIL with a note.
Update the mappings below after each step, rerun the full suite, then run this script.
"""
import re
from pathlib import Path

CMD = ('`.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` '
       '(local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 99 passed, 2026-09-21')
E, P, B = 'tests/engine/test_science.py::', 'tests/engine/test_properties.py::', 'tests/engine/test_background.py::'
H, AN, F = 'tests/api/test_http.py::', 'tests/api/test_analysis.py::', 'tests/api/test_field_work.py::'
W = 'tests/e2e/test_report_flow.py::'
T = 'tests/e2e/test_task_flow.py::test_task_proposal_assignment_capture_and_review'

PASSES = {
    'B01': [W + 'test_guest_landmark_report_survives_sign_in_and_opens_one_case'],
    'B02': [H + 'test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent', W + 'test_guest_landmark_report_survives_sign_in_and_opens_one_case'],
    'B03': [H + 'test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent', W + 'test_guest_landmark_report_survives_sign_in_and_opens_one_case'],
    'B06': [H + 'test_upload_rejects_disguised_and_oversized_images', W + 'test_guest_landmark_report_survives_sign_in_and_opens_one_case', W + 'test_signed_in_photo_report_uploads_then_submits'],
    'B07': [H + 'test_photo_upload_strips_location_and_attaches_to_report'],
    'B08': [H + 'test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent'],
    'D01': [F + 'test_assignment_checks_qualification_instrument_version_and_limitations', T],
    'D02': [F + 'test_two_claims_yield_one_assignment_and_one_conflict'],
    'D03': [F + 'test_concurrent_instrument_bookings_admit_one'],
    'D04': [F + 'test_decline_requires_reason_and_keeps_case_usable'],
    'D05': [F + 'test_qualification_is_checked_at_measurement_time'],
    'D06': [F + 'test_conductivity_modes_are_explicit_and_units_round_trip', F + 'test_missing_metadata_meter_sc25_and_calibration_are_history_only'],
    'D07': [F + 'test_missing_metadata_meter_sc25_and_calibration_are_history_only'],
    'D08': [F + 'test_replicates_are_individual_and_idempotent', P + 'test_raw_shared_scopes_and_independent_compensation', T],
    'D09': [F + 'test_reading_stays_valid_after_calibration_expires', F + 'test_calibration_events_are_append_only_and_expert_recorded'],
    'D12': [F + 'test_missing_metadata_meter_sc25_and_calibration_are_history_only'],
    'D13': [F + 'test_access_closure_blocks_tasks_and_assignment'],
    'D14': [F + 'test_assignment_checks_qualification_instrument_version_and_limitations', T],
    'E01': [E + 'test_graph_signatures_and_lengths'],
    'E02': [E + 'test_graph_signatures_and_lengths'],
    'E03': [E + 'test_graph_signatures_and_lengths', AN + 'test_readiness_reports_missing_prerequisites_independently'],
    'E04': [E + 'test_independent_fraction_oracle', E + 'test_real_solver_canonical_arithmetic[None-5300]', AN + 'test_worker_computes_fixture_assessment_and_conservative_plan'],
    'E05': [E + 'test_removing_evidence_restores_candidates'],
    'E06': [E + 'test_real_solver_canonical_arithmetic[high-2300]', E + 'test_real_solver_canonical_arithmetic[low-3000]'],
    'E07': [E + 'test_removing_evidence_restores_candidates'],
    'E09': [B + 'test_raw_background_propagation_and_compensation_regression'],
    'E10': [P + 'test_generated_converging_graph_truth_retention', E + 'test_unknown_and_missing_readiness_never_excludes'],
    'E11': [P + 'test_widening_bounds_and_removing_evidence_preserve_feasible_classes', E + 'test_unknown_and_missing_readiness_never_excludes'],
    'E12': [P + 'test_raw_shared_scopes_and_independent_compensation', P + 'test_delimiter_collisions_cannot_merge_distinct_reading_errors'],
    'E13': [E + 'test_unknown_and_missing_readiness_never_excludes', P + 'test_negative_event_is_conflict_and_resource_failure_retains'],
    'E15': [E + 'test_real_solver_canonical_arithmetic[None-5300]', E + 'test_canonical_hash_deduplicates_and_orders_readings'],
    'E16': [E + 'test_planner_ambiguous_outcomes_and_budget_safety'],
    'E17': [P + 'test_exact_products_are_inside_mccormick_envelopes', P + 'test_generated_converging_graph_truth_retention'],
    'E18': [P + 'test_planner_oracle_and_resource_limits'],
    'E19': [P + 'test_planner_oracle_and_resource_limits', E + 'test_planner_ambiguous_outcomes_and_budget_safety'],
    'E21': [E + 'test_truth_ai_float_and_bad_intervals_rejected'],
    'E23': ['tests/engine/test_readiness_and_precision.py::test_transport_bound_is_computed_from_paths_and_velocity'],
    'E24': [P + 'test_negative_event_is_conflict_and_resource_failure_retains'],
    'E25': [B + 'test_chronological_evaluation_freezes_fit_and_counts_independent_events'],
    'G01': [H + 'test_other_org_and_unknown_records_are_not_found', 'tests/security/test_database.py::test_cross_tenant_relationship_is_rejected'],
    'G06': ['tests/api/test_contracts.py::test_profile_cannot_upgrade_capabilities', H + 'test_me_lists_capabilities_not_client_roles'],
}
PARTIAL = {
    'A03': 'Partial: e2e reload of the directory (test_directory_requires_sign_in_and_lists_example_cases); other required routes not built/tested yet.',
    'A08': 'Partial: fresh `supabase db reset --local` applies all migrations and the seed; upgrade from a prior schema not tested.',
    'B11': 'Partial: device-saved vs server-received shown in form and receipt; uploading/offline states not browser-tested.',
    'B14': 'Partial: default private asserted (test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent); cross-record exposure not tested.',
    'C09': 'Partial: test_readiness_reports_missing_prerequisites_independently covers mapping/flow-regime checks only.',
    'D10': 'Partial: held-for-review reason asserted (test_missing_metadata_meter_sc25_and_calibration_are_history_only); audit entry not asserted.',
    'E08': 'Partial: 105/23 (test_independent_fraction_oracle) and U=5 bound 5300 (test_planner_ambiguous_outcomes_and_budget_safety); equality case not asserted.',
    'G02': 'Partial: another member gets 404 for private media (test_photo_upload_strips_location_and_attaches_to_report); internal evidence by ID not tested.',
    'G07': 'Partial: foreign Origin rejected (test_foreign_origin_rejected, test_origin_mismatch_rejected); unsafe HTML/prompt injection not tested.',
    'G08': 'Partial: MIME mismatch and >40 MP rejected (test_upload_rejects_disguised_and_oversized_images); oversize import not tested.',
    'J02': 'Partial: analysis runs in the worker off the request path (test_worker_computes_fixture_assessment_and_conservative_plan); cancellation not tested.',
}

path = Path(__file__).resolve().parents[1] / 'docs/release-results.md'
text = path.read_text(encoding='utf-8')


def row(match):
    gate = match.group(1)
    if gate in PASSES:
        return f'| {gate} | PASS | {CMD} | ' + '; '.join(PASSES[gate]) + ' |'
    if gate in PARTIAL:
        return f'| {gate} | FAIL | {CMD} | {PARTIAL[gate]} |'
    return match.group(0)


text = re.sub(r'^\| ([A-J]\d\d) \| [A-Z_]+ \| .*\|$', row, text, flags=re.M)
path.write_text(text, encoding='utf-8')
print(text.count('| PASS |'), 'gates PASS;', text.count('| FAIL |'), 'FAIL')
