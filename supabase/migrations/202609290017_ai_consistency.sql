-- AI consistency check (Track 3): a describe run keeps its deterministic text/photo cross-check and, once the report is
-- submitted, the report it helped with. Whoever may read that report may read the run's checks and accepted wording;
-- the run itself never changes the report, its case or any assessment.
alter table public.ai_runs
 add column report_id uuid references public.reports(id),
 add column checks jsonb not null default '[]';
create index ai_runs_report on public.ai_runs(report_id) where report_id is not null;

create policy ai_run_of_readable_report on public.ai_runs for select to authenticated
 using (report_id is not null and exists(select 1 from public.reports r where r.id = ai_runs.report_id and r.org_id = ai_runs.org_id));
