"""Record acceptance-gate evidence in docs/release-results.md.

PASS only with the exact command and the passing test node IDs. Partially covered gates stay FAIL with a note.
Update the mappings below after each step, rerun the full suite, then run this script.
"""
import re
from pathlib import Path

CMD = ('`.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` '
       '(local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 144 passed, 2026-09-22')
E, P, B = 'tests/engine/test_science.py::', 'tests/engine/test_properties.py::', 'tests/engine/test_background.py::'
H, AN, F = 'tests/api/test_http.py::', 'tests/api/test_analysis.py::', 'tests/api/test_field_work.py::'
W = 'tests/e2e/test_report_flow.py::'
T = 'tests/e2e/test_task_flow.py::test_task_proposal_assignment_capture_and_review'
M, MS = 'tests/api/test_mapping.py::', 'tests/e2e/test_map_setup.py::'
RA, SEC = 'tests/e2e/test_responsive_a11y.py::', 'tests/security/test_secrets.py::'
RT, MB = 'tests/e2e/test_routes.py::', 'tests/api/test_membership.py::'
RC, RCE = 'tests/api/test_receipts.py::', 'tests/e2e/test_receipts_flow.py::'
R, RE = 'tests/api/test_review.py::', 'tests/e2e/test_review_flow.py::'
X, XE = 'tests/api/test_exports.py::', 'tests/e2e/test_export_flow.py::test_package_send_and_recipient_acknowledgment'

PASSES = {
    'A03': [RT + 'test_workspace_and_case_routes_render[expert]', RT + 'test_workspace_and_case_routes_render[coordinator]', W + 'test_directory_requires_sign_in_and_lists_example_cases'],
    'A05': [SEC + 'test_production_build_and_repository_have_no_privileged_secrets', SEC + 'test_web_typecheck_passes', SEC + 'test_scanner_detects_planted_service_key_and_private_key'],
    'A06': ['tests/api/test_bootstrap.py::test_bootstrap_creates_real_org_with_admin_only'],
    'B01': [W + 'test_guest_landmark_report_survives_sign_in_and_opens_one_case', H + 'test_first_time_reporter_can_upload_before_any_report'],
    'B02': [H + 'test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent', W + 'test_guest_landmark_report_survives_sign_in_and_opens_one_case'],
    'B03': [H + 'test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent', W + 'test_guest_landmark_report_survives_sign_in_and_opens_one_case'],
    'B04': [M + 'test_not_on_map_keeps_pin_accuracy_and_local_name_as_provisional_waterway', MS + 'test_report_pin_is_placed_by_map_click_without_snapping'],
    'B09': [RC + 'test_duplicate_suggestion_can_be_rejected_and_merge_preserves_both_reports', RCE + 'test_duplicate_suggested_rejected_and_merged'],
    'B12': [RC + 'test_receipts_show_effect_and_become_revised_after_supersession', RCE + 'test_receipt_shows_effect_then_revision'],
    'B13': [RC + 'test_receipts_show_effect_and_become_revised_after_supersession', RCE + 'test_receipt_shows_effect_then_revision'],
    'C01': [M + 'test_import_preserves_provenance_defaults_unverified_and_crossing_is_not_confluence', MS + 'test_import_station_verify_and_publish'],
    'C02': [M + 'test_import_preserves_provenance_defaults_unverified_and_crossing_is_not_confluence'],
    'C03': [M + 'test_culvert_and_split_topology_block_localization_but_case_stays_usable', E + 'test_unknown_connectivity_and_open_boundary_are_explicit'],
    'C04': [M + 'test_import_preserves_provenance_defaults_unverified_and_crossing_is_not_confluence', MS + 'test_import_station_verify_and_publish'],
    'C05': [M + 'test_culvert_and_split_topology_block_localization_but_case_stays_usable', E + 'test_graph_signatures_and_lengths'],
    'C07': [M + 'test_publication_requires_verifier_evidence_and_freezes_version', M + 'test_new_network_version_keeps_old_assessment_dependencies', MS + 'test_import_station_verify_and_publish'],
    'C08': [M + 'test_waterway_external_id_does_not_change_report_ids'],
    'C10': [M + 'test_publication_requires_verifier_evidence_and_freezes_version', E + 'test_unknown_connectivity_and_open_boundary_are_explicit'],
    'C12': [M + 'test_station_splits_reach_without_snapping_and_preserves_length', MS + 'test_directory_map_and_list_show_precision', MS + 'test_report_pin_is_placed_by_map_click_without_snapping'],
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
    'D13': [F + 'test_access_closure_blocks_tasks_and_assignment'],
    'D14': [F + 'test_assignment_checks_qualification_instrument_version_and_limitations', T],
    'D11': [R + 'test_instrument_failure_review_exclusion_and_supersession'],
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
    'F01': [R + 'test_instrument_failure_review_exclusion_and_supersession', 'tests/security/test_database.py::test_versions_are_immutable_even_for_maintenance'],
    'F02': [R + 'test_changed_dependency_blocks_approval'],
    'F03': [R + 'test_only_experts_approve', RE + 'test_admin_sees_no_approval_controls'],
    'F04': [R + 'test_instrument_failure_review_exclusion_and_supersession'],
    'F05': [R + 'test_instrument_failure_review_exclusion_and_supersession', RE + 'test_expert_approves_then_reviews_expanded_revision'],
    'F06': [X + 'test_supersession_sends_distinct_revision_notice_and_keeps_old_bytes'],
    'F07': [X + 'test_delivery_acknowledgment_retry_and_scoped_link', XE],
    'F08': [X + 'test_delivery_acknowledgment_retry_and_scoped_link'],
    'F09': [X + 'test_delivery_acknowledgment_retry_and_scoped_link', XE],
    'F12': [X + 'test_export_contains_matching_versions_and_verifies', 'tests/packages/test_packages.py::test_exports_share_version_geometry_origin_and_preserve_exact_values', 'tests/packages/test_pdf_cli.py::test_real_pdf_contains_reviewed_content_and_blocks_external_requests'],
    'F15': [X + 'test_export_contains_matching_versions_and_verifies', 'tests/packages/test_packages.py::test_signed_package_detects_tamper_wrong_key_missing_signature_and_wrong_predecessor', 'tests/packages/test_pdf_cli.py::test_cli_verifies_signature_and_rejects_tampering'],
    'F16': [X + 'test_export_contains_matching_versions_and_verifies', XE],
    'F17': [X + 'test_supersession_sends_distinct_revision_notice_and_keeps_old_bytes', 'tests/packages/test_packages.py::test_superseding_build_never_rewrites_old_signed_package'],
    'F10': [R + 'test_request_more_evidence_and_inspection_decision_coexist_with_limits'],
    'J08': [X + 'test_supersession_sends_distinct_revision_notice_and_keeps_old_bytes', XE],
    'G01': [H + 'test_other_org_and_unknown_records_are_not_found', 'tests/security/test_database.py::test_cross_tenant_relationship_is_rejected'],
    'G03': [MB + 'test_revoked_membership_blocks_privileged_operations_immediately'],
    'G06': ['tests/api/test_contracts.py::test_profile_cannot_upgrade_capabilities', H + 'test_me_lists_capabilities_not_client_roles', MB + 'test_capabilities_cannot_be_self_granted_or_granted_by_non_admins'],
}
PARTIAL = {
    'I05': 'Partial: 12 key public/workspace pages have no horizontal scroll at 1920-320 px (test_pages_reflow_without_horizontal_scroll[*]); not every page and no map-height/menu assertions.',
    'I06': 'Partial: keyboard-only reporting with focus on each step heading (test_keyboard_only_report); task, measurement, map alternative, review and acknowledgment paths not yet keyboard-tested.',
    'I09': 'Partial: OS reduced motion sets reduced mode with no running entrance animation, and the application setting persists (test_reduced_motion_is_honoured); camera flight and shimmer not asserted per page.',
    'A07': 'Partial: every required route renders and all internal links resolve (test_public_routes_and_links_resolve, test_workspace_and_case_routes_render); loading/empty/error/permission states are implemented per page but not asserted route by route.',
    'J11': 'Partial: no dead internal links (test_public_routes_and_links_resolve); unwired-button and content audit not automated.',
    'I08': 'Partial: automated axe finds zero serious/critical issues on key public and workspace pages (test_no_serious_accessibility_violations); 200% zoom, reflow and manual checks not done.',
    'A08': 'Partial: fresh `supabase db reset --local` applies all migrations and the seed; upgrade from a prior schema not tested.',
    'B11': 'Partial: device-saved vs server-received shown in form and receipt; uploading/offline states not browser-tested.',
    'B14': 'Partial: default private asserted (test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent); cross-record exposure not tested.',
    'C06': 'Partial: station insertion splits the reach and preserves length (test_station_splits_reach_without_snapping_and_preserves_length); signature recompute and row subdivision without a station not asserted.',
    'H07': 'Partial: no-basemap fallback is labelled (test_directory_map_and_list_show_precision); a failing configured provider is not tested.',
    'C09': 'Partial: test_readiness_reports_missing_prerequisites_independently covers mapping/flow-regime checks only.',
    'D12': 'Partial: only the server side is verified - a reading submitted under an older task version is kept and flagged (test_missing_metadata_meter_sc25_and_calibration_are_history_only); the offline client does not exist yet.',
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
