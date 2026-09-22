"""Record acceptance-gate evidence in docs/release-results.md.

PASS only with the exact command and the passing test node IDs. Partially covered gates stay FAIL with a note.
Update the mappings below after each step, rerun the full suite, then run this script.
"""
import re
from pathlib import Path

CMD = ('`.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider -rA` '
       '(local Supabase + `pnpm seed:example`; API :8000, worker, `next start` :3000) - 188 passed, 1 skipped (destructive), 2026-09-22')
E, P, B = 'tests/engine/test_science.py::', 'tests/engine/test_properties.py::', 'tests/engine/test_background.py::'
H, AN, F = 'tests/api/test_http.py::', 'tests/api/test_analysis.py::', 'tests/api/test_field_work.py::'
W = 'tests/e2e/test_report_flow.py::'
T = 'tests/e2e/test_task_flow.py::test_task_proposal_assignment_capture_and_review'
M, MS = 'tests/api/test_mapping.py::', 'tests/e2e/test_map_setup.py::'
GM, GU = 'tests/api/test_gates_misc.py::', 'tests/e2e/test_gates_ui.py::'
SB = 'tests/security/test_boundaries.py::'
RA, SEC = 'tests/e2e/test_responsive_a11y.py::', 'tests/security/test_secrets.py::'
RT, MB = 'tests/e2e/test_routes.py::', 'tests/api/test_membership.py::'
RC, RCE = 'tests/api/test_receipts.py::', 'tests/e2e/test_receipts_flow.py::'
R, RE = 'tests/api/test_review.py::', 'tests/e2e/test_review_flow.py::'
X, XE = 'tests/api/test_exports.py::', 'tests/e2e/test_export_flow.py::test_package_send_and_recipient_acknowledgment'

PASSES = {
    'A03': [RT + 'test_workspace_and_case_routes_render[expert]', RT + 'test_workspace_and_case_routes_render[coordinator]', W + 'test_directory_requires_sign_in_and_lists_example_cases'],
    'C09': ['tests/api/test_readiness_checks.py::test_each_missing_prerequisite_is_reported_on_its_own', F + 'test_invalid_instrument_at_measurement_time_is_held_and_logged', AN + 'test_readiness_reports_missing_prerequisites_independently'],
    'D10': [F + 'test_invalid_instrument_at_measurement_time_is_held_and_logged'],
    'E08': ['tests/engine/test_threshold_equality.py::test_threshold_equality_is_ambiguous', 'tests/engine/test_threshold_equality.py::test_exact_planner_matches_threshold_on_both_sides', E + 'test_planner_ambiguous_outcomes_and_budget_safety'],
    'J04': [GU + 'test_origin_is_labelled_on_maps_observations_receipts_and_examples', X + 'test_export_contains_matching_versions_and_verifies'],
    'C06': ['tests/engine/test_topology_and_limits.py::test_row_subdivision_alone_preserves_results', 'tests/engine/test_topology_and_limits.py::test_station_insertion_splits_reach_and_recomputes_signatures', M + 'test_station_splits_reach_without_snapping_and_preserves_length'],
    'C11': [E + 'test_unknown_connectivity_and_open_boundary_are_explicit', M + 'test_publication_requires_verifier_evidence_and_freezes_version', 'tests/packages/test_packages.py::test_html_escapes_untrusted_prose_and_includes_review_and_limits'],
    'E20': ['tests/engine/test_topology_and_limits.py::test_unresolved_results_are_never_dropped_to_match_a_prediction', P + 'test_planner_oracle_and_resource_limits'],
    'E26': ['tests/engine/test_topology_and_limits.py::test_multi_source_case_states_limits_without_detection_claims'],
    'F13': ['tests/packages/test_fhir_official.py::test_official_validator_zero_errors_on_real_export', 'tests/packages/test_fhir.py::test_environmental_bundle_preserves_semantics_and_uses_correct_document_context'],
    'F14': ['tests/packages/test_fhir.py::test_raw_and_compensated_readings_are_distinct_and_linked', 'tests/packages/test_fhir.py::test_fhir_reference_validation_rejects_broken_link', 'tests/packages/test_fhir.py::test_exact_decimal_version_attribution_and_custom_canonical_survive'],
    'H01': ['tests/e2e/test_offline.py::test_draft_survives_closing_the_tab'],
    'H02': ['tests/e2e/test_offline.py::test_offline_submission_is_queued_then_sent_once_with_photo', 'tests/e2e/test_offline.py::test_send_interrupted_by_closing_the_tab_is_retried'],
    'H03': ['tests/e2e/test_offline.py::test_account_switch_never_sends_another_users_draft'],
    'H05': ['tests/e2e/test_offline.py::test_offline_submission_is_queued_then_sent_once_with_photo'],
    'H09': ['tests/e2e/test_offline.py::test_expired_session_keeps_the_form_and_resumes_after_sign_in'],
    'H12': ['tests/e2e/test_offline.py::test_offline_submission_is_queued_then_sent_once_with_photo', W + 'test_signed_in_photo_report_uploads_then_submits'],
    'B10': ['tests/api/test_ai.py::test_unavailable_ai_is_labelled_and_never_blocks_the_report', 'tests/api/test_ai.py::test_valid_suggestion_requires_review_and_photos_need_consent', GU + 'test_ai_unavailable_is_labelled_and_manual_reporting_continues'],
    'H08': ['tests/api/test_ai.py::test_unavailable_ai_is_labelled_and_never_blocks_the_report', 'tests/api/test_ai.py::test_provider_timeout_falls_back_quickly', GU + 'test_ai_unavailable_is_labelled_and_manual_reporting_continues'],
    'G07': [H + 'test_foreign_origin_rejected', 'tests/api/test_contracts.py::test_origin_mismatch_rejected', GU + 'test_report_html_is_rendered_as_text_not_executed', 'tests/api/test_ai.py::test_prompt_injection_in_report_text_cannot_act', 'tests/api/test_ai.py::test_invalid_or_overreaching_output_is_rejected_whole[extra_key]'],
    'A02': [GM + 'test_core_workflow_runs_without_paid_providers', W + 'test_guest_landmark_report_survives_sign_in_and_opens_one_case', 'tests/e2e/test_export_flow.py::test_package_send_and_recipient_acknowledgment'],
    'B05': [GU + 'test_geolocation_denied_still_allows_landmark_report_without_land_assertion'],
    'B14': [GM + 'test_visibility_choice_never_exposes_other_records', H + 'test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent'],
    'B15': [GU + 'test_geolocation_denied_still_allows_landmark_report_without_land_assertion'],
    'E14': [GM + 'test_no_fitted_probability_or_health_score_in_results'],
    'E22': [GM + 'test_context_layers_do_not_change_compatibility_inputs', E + 'test_truth_ai_float_and_bad_intervals_rejected'],
    'E27': [GM + 'test_real_organizations_get_no_synthetic_protocol_bounds', 'tests/api/test_bootstrap.py::test_bootstrap_creates_real_org_with_admin_only'],
    'G08': [H + 'test_upload_rejects_disguised_and_oversized_images', GM + 'test_oversize_media_and_imports_are_rejected'],
    'I15': [GU + 'test_no_perpetual_decorative_motion_after_settling'],
    'I16': [GU + 'test_back_and_forward_keep_case_identity'],
    'J06': [B + 'test_chronological_evaluation_freezes_fit_and_counts_independent_events'],
    'J10': ['tests/test_docs.py::test_runbook_classifies_every_env_var_and_covers_procedures', 'tests/test_docs.py::test_readme_lists_the_documented_local_commands'],
    'A04': ['tests/api/test_durability.py::test_crashed_worker_lease_is_reclaimed_without_duplicates', 'tests/api/test_durability.py::test_retried_submission_after_restart_does_not_duplicate_case', 'tests/api/test_durability.py::test_worker_loop_survives_database_interruption'],
    'A08': ['tests/migrations/test_upgrade.py::test_upgrade_from_earlier_schema_preserves_data_then_fresh_reset_works'],
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
    'G02': [SB + 'test_contributor_cannot_read_internal_evidence_or_others_media_by_id', H + 'test_photo_upload_strips_location_and_attaches_to_report'],
    'G05': [SB + 'test_direct_rest_and_rpc_cannot_bypass_policies', 'tests/security/test_database.py::test_all_domain_tables_have_rls', SEC + 'test_production_build_and_repository_have_no_privileged_secrets'],
    'G09': [SB + 'test_urls_in_reports_and_imports_are_never_fetched'],
    'G12': [SB + 'test_personal_data_export_and_deletion_request', H + 'test_landmark_only_report_opens_one_unresolved_case_and_is_idempotent'],
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
    'B11': 'Partial: device-saved vs server-received shown in form and receipt; uploading/offline states not browser-tested.',
    'H07': 'Partial: no-basemap fallback is labelled (test_directory_map_and_list_show_precision); a failing configured provider is not tested.',
    'D12': 'Partial: server side verified (test_missing_metadata_meter_sc25_and_calibration_are_history_only); the offline client now queues reports, but offline capture of task readings is not built yet.',
    'G11': 'Partial: API access log contains no report text, coordinates or service key (test_access_log_has_no_report_text_or_coordinates); worker log not asserted.',
    'J02': 'Partial: analysis runs in the worker off the request path (test_worker_computes_fixture_assessment_and_conservative_plan); cancellation not tested.',
}

path = Path(__file__).resolve().parents[1] / 'docs/release-results.md'
text = path.read_text(encoding='utf-8')


COMMANDS = {'A08': '`UPSTREAM_RUN_DESTRUCTIVE=1 .venv/Scripts/python.exe -m pytest tests/migrations -q -p no:cacheprovider -rA` (resets the local database, then reseeds) - 1 passed, 2026-09-22'}


def row(match):
    gate = match.group(1)
    if gate in PASSES:
        return f'| {gate} | PASS | {COMMANDS.get(gate, CMD)} | ' + '; '.join(PASSES[gate]) + ' |'
    if gate in PARTIAL:
        return f'| {gate} | FAIL | {CMD} | {PARTIAL[gate]} |'
    return match.group(0)


text = re.sub(r'^\| ([A-J]\d\d) \| [A-Z_]+ \| .*\|$', row, text, flags=re.M)
path.write_text(text, encoding='utf-8')
print(text.count('| PASS |'), 'gates PASS;', text.count('| FAIL |'), 'FAIL')
