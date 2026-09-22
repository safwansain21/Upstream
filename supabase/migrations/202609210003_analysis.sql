-- Mixing review is a separate network prerequisite from connectivity (SCIENTIFIC-ENGINE §3).
alter table public.network_versions add column mixing_reviewed boolean not null default false;
create index assessments_case on public.assessments(org_id,case_id,revision desc);
create index class_results_assessment on public.class_results(assessment_id);
create index recommendations_assessment on public.recommendations(assessment_id);
