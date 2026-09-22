-- Tenant relationships are composite. Mutable workflow pointers never rewrite evidence versions.
create schema if not exists private;
create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
 locale text not null default 'en', timezone text not null default 'UTC', intake_enabled boolean not null default false,
 contact text, intake_policy jsonb not null default '{}', example boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id), display_name text not null default 'Contributor',
 locale text not null default 'en', motion_preference text not null default 'system' check(motion_preference in ('system','reduced','full')),
 simplify_map boolean not null default false, privacy_defaults jsonb not null default '{}', deletion_requested_at timestamptz
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id),
 user_id uuid not null references auth.users(id), status text not null default 'active' check(status in ('active','invited','revoked')),
 created_at timestamptz not null default now(), unique(org_id,user_id), unique(org_id,id)
);
create index memberships_user on memberships(user_id,status,org_id);
create table public.member_capabilities (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, membership_id uuid not null,
 capability text not null check(capability in ('coordinate','expert','admin','network_verify','evidence_view','monitor')),
 granted_by uuid references auth.users(id), expires_at timestamptz,
 foreign key(org_id,membership_id) references memberships(org_id,id), unique(membership_id,capability)
);
create table public.qualifications (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, membership_id uuid not null,
 task_type text not null, evidence_document text not null, reviewed_by uuid not null references auth.users(id),
 valid_from timestamptz not null, valid_until timestamptz not null, check(valid_until>valid_from),
 foreign key(org_id,membership_id) references memberships(org_id,id)
);
create index qualifications_membership on qualifications(membership_id,task_type,valid_until);

create function private.is_member(o uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m where m.org_id=o and m.user_id=(select auth.uid()) and m.status='active');
$$;
create function private.has_capability(o uuid,c text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m join public.member_capabilities p on p.membership_id=m.id and p.org_id=m.org_id
 where m.org_id=o and m.user_id=(select auth.uid()) and m.status='active' and p.capability=c and (p.expires_at is null or p.expires_at>now()));
$$;

create table public.waterways (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), local_name text,
 aliases text[] not null default '{}', external_ids jsonb not null default '{}', provisional boolean not null default true,
 version integer not null default 1, unique(org_id,id)
);
create table public.cases (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), title text not null,
 workflow text not null default 'reported' check(workflow in ('reported','triage','confirmation','localization_active','inspection_recommended','escalated','closed_no_anomaly','closed_insufficient','archived')),
 created_by uuid references auth.users(id), coordinator_id uuid references auth.users(id), waterway_id uuid,
 data_origin text not null default 'real' check(data_origin in ('real','synthetic','replayed')),
 version integer not null default 1, review_hold boolean not null default false, current_assessment_id uuid,
 network_id uuid, merged_into uuid, locality text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(org_id,id), foreign key(org_id,waterway_id) references waterways(org_id,id), foreign key(org_id,merged_into) references cases(org_id,id)
);
create index cases_directory on cases(org_id,updated_at desc,id);
create table public.reports (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, reporter_id uuid references auth.users(id),
 client_id uuid not null, categories text[] not null default '{}', description text not null check(length(description)<=2000),
 observed_at timestamptz not null, timezone text not null, location extensions.geometry(Point,4326), landmark text not null default '',
 location_precision text not null default 'unresolved' check(location_precision in ('unresolved','approximate','confirmed')),
 accuracy_m numeric check(accuracy_m>0), location_method text not null default 'landmark', waterway_id uuid,
 public_visibility boolean not null default false, version integer not null default 1, created_at timestamptz not null default now(),
 data_origin text not null default 'real' check(data_origin in ('real','synthetic','replayed')),
 check(cardinality(categories)>0 or length(description)>=10), unique(org_id,id), unique(reporter_id,client_id),
 foreign key(org_id,case_id) references cases(org_id,id), foreign key(org_id,waterway_id) references waterways(org_id,id)
);
create index reports_case on reports(org_id,case_id);
create index reports_owner on reports(reporter_id,created_at desc);
create index reports_location on reports using gist(location);
create table public.report_versions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, report_id uuid not null,
 version integer not null, content jsonb not null, content_hash text not null, change_reason text,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), supersedes_version integer,
 unique(report_id,version), foreign key(org_id,report_id) references reports(org_id,id)
);
create table public.case_reports (
 org_id uuid not null, case_id uuid not null, report_id uuid not null, linked_at timestamptz not null default now(),
 primary key(case_id,report_id), foreign key(org_id,case_id) references cases(org_id,id), foreign key(org_id,report_id) references reports(org_id,id)
);
create table public.media_assets (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), owner_id uuid not null references auth.users(id),
 report_id uuid, private_key text not null unique, derivative_key text, mime text not null,
 sha256 text not null, bytes bigint not null check(bytes between 1 and 15728640), width integer not null, height integer not null,
 consent_original boolean not null default false, consent_ai boolean not null default false, scan_state text not null default 'pending',
 created_at timestamptz not null default now(), check(width::bigint*height<=40000000), unique(org_id,id),
 foreign key(org_id,report_id) references reports(org_id,id)
);
create table public.case_events (
 sequence bigint generated always as identity primary key, org_id uuid not null, case_id uuid not null, event_type text not null,
 actor_id uuid references auth.users(id), object_id uuid, object_version integer, payload jsonb not null default '{}',
 occurred_at timestamptz not null default now(), foreign key(org_id,case_id) references cases(org_id,id)
);
create index case_events_stream on case_events(org_id,case_id,sequence);

create table public.network_versions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, version integer not null,
 source text not null, license text not null, retrieved_at timestamptz, crs text not null default 'EPSG:4326',
 status text not null default 'proposed' check(status in ('proposed','reviewed','rejected')),
 completeness text not null default 'unknown', flow_regime text not null default 'unknown', boundary_treatment text not null default 'unknown',
 evidence_refs text[] not null default '{}', content_hash text not null, reviewed_by uuid references auth.users(id),
 review_reason text, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 unique(org_id,id), unique(case_id,version), foreign key(org_id,case_id) references cases(org_id,id)
);
create table public.network_nodes (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, network_id uuid not null, code text not null,
 kind text not null, point extensions.geometry(Point,4326), boundary text not null default 'unknown',
 unique(org_id,id), unique(network_id,code), foreign key(org_id,network_id) references network_versions(org_id,id)
);
create table public.network_edges (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, network_id uuid not null, code text not null,
 from_node uuid not null, to_node uuid not null, line extensions.geometry(LineString,4326), length_m numeric not null check(length_m>0),
 flow_status text not null default 'unknown', connectivity text not null default 'mapped_unverified', evidence_refs text[] not null default '{}',
 unique(org_id,id), unique(network_id,code), foreign key(org_id,network_id) references network_versions(org_id,id),
 foreign key(org_id,from_node) references network_nodes(org_id,id), foreign key(org_id,to_node) references network_nodes(org_id,id), check(from_node<>to_node)
);
create table public.stations (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, network_id uuid,
 code text not null, point extensions.geometry(Point,4326), edge_id uuid, status text not null default 'proposed',
 access_status text not null default 'unknown', access_notes text not null default '', version integer not null default 1,
 unique(org_id,id), unique(case_id,code), foreign key(org_id,case_id) references cases(org_id,id),
 foreign key(org_id,network_id) references network_versions(org_id,id), foreign key(org_id,edge_id) references network_edges(org_id,id)
);
create table public.access_records (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, station_id uuid,
 status text not null check(status in ('open','closed','unknown')), notes text not null, observed_at timestamptz not null,
 valid_until timestamptz, created_by uuid references auth.users(id), reviewed_by uuid references auth.users(id),
 foreign key(org_id,case_id) references cases(org_id,id), foreign key(org_id,station_id) references stations(org_id,id)
);
create table public.context_features (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null,
 kind text not null check(kind in ('public_access','animal_access','habitat')), geometry extensions.geometry(Geometry,4326),
 source text not null, license text not null, sensitive boolean not null default true, data_origin text not null,
 foreign key(org_id,case_id) references cases(org_id,id)
);

create table public.instruments (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), serial text not null,
 model text not null, capabilities text[] not null default '{}', specifications jsonb not null default '{}',
 available boolean not null default true, owner_id uuid references auth.users(id), version integer not null default 1,
 unique(org_id,id), unique(org_id,serial)
);
create table public.calibration_events (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, instrument_id uuid not null,
 status text not null check(status in ('pass','fail','indeterminate')), effective_from timestamptz not null,
 effective_until timestamptz, checked_at timestamptz not null, bounds jsonb, certificate text, reason text not null,
 reviewer_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(org_id,id), foreign key(org_id,instrument_id) references instruments(org_id,id), check(effective_until is null or effective_until>effective_from)
);
create table public.protocol_versions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), entity_id uuid not null,
 version integer not null, name text not null, configuration jsonb not null, status text not null default 'draft',
 data_origin text not null, content_hash text not null, source text not null, signed_by uuid references auth.users(id),
 created_at timestamptz not null default now(), unique(org_id,id), unique(entity_id,version)
);
create table public.background_versions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, station_id uuid not null, version integer not null,
 enclosure jsonb not null, scope jsonb not null, samples jsonb not null default '[]', chronology jsonb not null default '{}',
 method text not null, provenance text not null, reviewer_id uuid references auth.users(id), content_hash text not null,
 data_origin text not null, created_at timestamptz not null default now(), unique(org_id,id), unique(station_id,version),
 foreign key(org_id,station_id) references stations(org_id,id)
);
create table public.transport_versions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, version integer not null,
 configuration jsonb not null, provenance text not null, content_hash text not null, reviewer_id uuid references auth.users(id),
 data_origin text not null, created_at timestamptz not null default now(), unique(org_id,id), unique(case_id,version),
 foreign key(org_id,case_id) references cases(org_id,id)
);
create table public.water_condition_groups (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), coefficient jsonb not null,
 temperature_domain jsonb not null, sharing_scope text not null, justification text not null, source text not null, unique(org_id,id)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, task_type text not null,
 state text not null default 'proposed' check(state in ('proposed','assigned','accepted','in_progress','submitted','completed','declined','cancelled','expired','blocked','needs_revision')),
 purpose text not null, limitations text not null default 'Evidence may not narrow the retained area. Use approved access points.',
 assignee_id uuid references auth.users(id), station_id uuid, instrument_id uuid, protocol_id uuid,
 window_start timestamptz not null, window_end timestamptz not null, estimated_minutes integer not null default 30,
 rationale_hash text, version integer not null default 1, reason text, created_at timestamptz not null default now(),
 unique(org_id,id), check(window_end>window_start), foreign key(org_id,case_id) references cases(org_id,id),
 foreign key(org_id,station_id) references stations(org_id,id), foreign key(org_id,instrument_id) references instruments(org_id,id),
 foreign key(org_id,protocol_id) references protocol_versions(org_id,id)
);
create index tasks_assignee_state on tasks(org_id,assignee_id,state);
create table public.instrument_bookings (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, instrument_id uuid not null, task_id uuid not null,
 during tstzrange not null, active boolean not null default true,
 foreign key(org_id,instrument_id) references instruments(org_id,id), foreign key(org_id,task_id) references tasks(org_id,id),
 exclude using gist(instrument_id with =, during with &&) where(active)
);
create table public.visits (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, task_id uuid not null, station_id uuid not null,
 instrument_id uuid not null, operator_id uuid not null references auth.users(id), started_at timestamptz not null,
 shared_effect_group text not null, unique(org_id,id), foreign key(org_id,task_id) references tasks(org_id,id),
 foreign key(org_id,station_id) references stations(org_id,id), foreign key(org_id,instrument_id) references instruments(org_id,id)
);
create table public.reading_versions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, entity_id uuid not null,
 version integer not null, visit_id uuid not null, station_id uuid not null, instrument_id uuid not null, calibration_id uuid, protocol_id uuid,
 mode text not null check(mode in ('raw','meter_sc25','true_sc25_enclosure')), value numeric not null check(value>=0), unit text not null,
 temperature numeric, compensation jsonb, bounds jsonb, measured_at timestamptz not null, received_at timestamptz not null default now(),
 quality text not null default 'submitted', eligible boolean not null default false, ineligibility_reasons text[] not null default '{}',
 submitted_task_version integer not null, operator_id uuid references auth.users(id), data_origin text not null,
 content_hash text not null, supersedes_id uuid, notes text not null default '', unique(org_id,id), unique(entity_id,version),
 foreign key(org_id,case_id) references cases(org_id,id), foreign key(org_id,visit_id) references visits(org_id,id),
 foreign key(org_id,station_id) references stations(org_id,id), foreign key(org_id,instrument_id) references instruments(org_id,id),
 foreign key(org_id,calibration_id) references calibration_events(org_id,id), foreign key(org_id,protocol_id) references protocol_versions(org_id,id),
 foreign key(org_id,supersedes_id) references reading_versions(org_id,id)
);
create index reading_station_time on reading_versions(org_id,station_id,measured_at);
create table public.quality_decisions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, reading_id uuid not null,
 disposition text not null check(disposition in ('accepted','suspect','excluded','superseded_record')), reason text not null,
 reviewer_id uuid not null references auth.users(id), affected_interval tstzrange, created_at timestamptz not null default now(),
 foreign key(org_id,reading_id) references reading_versions(org_id,id)
);
create table public.task_submissions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, task_id uuid not null,
 submitter_id uuid not null references auth.users(id), reading_ids uuid[] not null default '{}', outcome text,
 disposition text not null default 'submitted', explanation text, created_at timestamptz not null default now(),
 foreign key(org_id,task_id) references tasks(org_id,id)
);

create table public.analysis_jobs (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, purpose text not null,
 input_hash text not null, snapshot jsonb not null, state text not null default 'queued', progress_stage text not null default 'Queued',
 lease_until timestamptz, lease_owner uuid, attempts integer not null default 0, available_at timestamptz not null default now(),
 last_error text, created_at timestamptz not null default now(), result_id uuid, cancelled_at timestamptz,
 unique(org_id,id), unique(purpose,input_hash,org_id), foreign key(org_id,case_id) references cases(org_id,id)
);
create index analysis_claim on analysis_jobs(state,available_at,lease_until);
create table public.assessments (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, revision integer not null,
 snapshot_hash text not null, snapshot jsonb not null, result jsonb not null, retained_length_m numeric,
 engine_version text not null, solver_version text not null, created_at timestamptz not null default now(),
 predecessor_id uuid, unique(org_id,id), unique(case_id,revision), foreign key(org_id,case_id) references cases(org_id,id),
 foreign key(org_id,predecessor_id) references assessments(org_id,id)
);
create table public.assessment_publications (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, assessment_id uuid not null,
 status text not null check(status in ('draft','approved','under_review','superseded','withdrawn','rejected','more_evidence')),
 reason text not null, actor_id uuid references auth.users(id), created_at timestamptz not null default now(),
 foreign key(org_id,assessment_id) references assessments(org_id,id)
);
create table public.assessment_dependencies (
 org_id uuid not null, assessment_id uuid not null, entity_type text not null, entity_id uuid not null,
 version integer not null, content_hash text not null, reason text not null,
 primary key(assessment_id,entity_type,entity_id,version), foreign key(org_id,assessment_id) references assessments(org_id,id)
);
create index dependencies_entity on assessment_dependencies(org_id,entity_type,entity_id,version);
create table public.class_results (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, assessment_id uuid not null, class_id text not null,
 status text not null check(status in ('compatible','incompatible','unresolved')), length_m numeric not null,
 member_edges text[] not null, problem_hash text not null, exact_problem text not null, solver_reason text, witness jsonb,
 foreign key(org_id,assessment_id) references assessments(org_id,id), unique(assessment_id,class_id)
);
create table public.task_proposals (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, assessment_id uuid,
 action jsonb not null, feasibility jsonb not null, predicted_bound_m numeric, score_status text not null,
 rationale text not null, dependency_hash text not null, unique(org_id,id),
 foreign key(org_id,case_id) references cases(org_id,id), foreign key(org_id,assessment_id) references assessments(org_id,id)
);
create table public.recommendations (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, assessment_id uuid not null,
 action jsonb not null, score_bound_m numeric, score_status text not null, constraints jsonb not null, rationale text not null,
 foreign key(org_id,assessment_id) references assessments(org_id,id)
);
create table public.expert_decisions (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, case_id uuid not null, assessment_id uuid,
 actor_id uuid not null references auth.users(id), action text not null, rationale text not null, segments text[] not null default '{}',
 context_sources text[] not null default '{}', created_at timestamptz not null default now(),
 foreign key(org_id,case_id) references cases(org_id,id), foreign key(org_id,assessment_id) references assessments(org_id,id)
);
alter table cases add foreign key(org_id,current_assessment_id) references assessments(org_id,id);
alter table cases add foreign key(org_id,network_id) references network_versions(org_id,id);

create table public.ai_runs (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), owner_id uuid not null references auth.users(id),
 purpose text not null, consent boolean not null, provider text, model text, schema_version text not null,
 input_refs jsonb not null, output jsonb, disposition text not null default 'pending', created_at timestamptz not null default now()
);
create table public.evidence_packages (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, assessment_id uuid not null,
 manifest jsonb not null, manifest_hash text not null unique, artifact_keys jsonb not null, signing_status text not null,
 predecessor_id uuid, created_at timestamptz not null default now(), unique(org_id,id),
 foreign key(org_id,assessment_id) references assessments(org_id,id), foreign key(org_id,predecessor_id) references evidence_packages(org_id,id)
);
create table public.recipients (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), name text not null,
 method text not null check(method in ('webhook','portal')), destination text, verified boolean not null default false,
 scopes text[] not null default '{package}', unique(org_id,id)
);
create table public.deliveries (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, package_id uuid not null, recipient_id uuid not null,
 state text not null default 'queued', delivered_at timestamptz, attempts integer not null default 0, last_error text,
 unique(org_id,id), unique(package_id,recipient_id), foreign key(org_id,package_id) references evidence_packages(org_id,id),
 foreign key(org_id,recipient_id) references recipients(org_id,id)
);
create table public.revision_notices (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, prior_package_id uuid not null, new_package_id uuid not null,
 recipient_id uuid not null, delivery_state text not null default 'queued', acknowledged_at timestamptz,
 acknowledgment_actor text, unique(org_id,id), unique(prior_package_id,new_package_id,recipient_id),
 foreign key(org_id,prior_package_id) references evidence_packages(org_id,id), foreign key(org_id,new_package_id) references evidence_packages(org_id,id),
 foreign key(org_id,recipient_id) references recipients(org_id,id)
);
create table public.share_grants (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, package_id uuid not null, notice_id uuid,
 token_hash text not null unique, scope text not null, expires_at timestamptz not null, revoked_at timestamptz,
 foreign key(org_id,package_id) references evidence_packages(org_id,id), foreign key(org_id,notice_id) references revision_notices(org_id,id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), user_id uuid not null references auth.users(id),
 type text not null, object_id uuid, object_version integer, message text not null, read_at timestamptz,
 dedupe_key text not null unique, created_at timestamptz not null default now()
);
create table public.follows (
 org_id uuid not null, user_id uuid not null references auth.users(id), case_id uuid not null,
 preferences jsonb not null default '{}', primary key(user_id,case_id), foreign key(org_id,case_id) references cases(org_id,id)
);
create table public.import_jobs (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), owner_id uuid not null references auth.users(id),
 format text not null, source text not null, original_hash text not null, mapping jsonb not null default '{}',
 preview jsonb not null, state text not null default 'preview', accepted_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(), unique(org_id,original_hash)
);
create table public.idempotency_keys (
 actor_id uuid not null references auth.users(id), operation text not null, key uuid not null,
 request_hash text not null, response jsonb not null, status integer not null,
 created_at timestamptz not null default now(), primary key(actor_id,operation,key)
);
create table public.outbox_jobs (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), event_type text not null,
 payload jsonb not null, dedupe_key text not null unique, state text not null default 'queued',
 available_at timestamptz not null default now(), lease_until timestamptz, lease_owner uuid,
 attempts integer not null default 0, last_error text, created_at timestamptz not null default now()
);
create index outbox_claim on outbox_jobs(state,available_at,lease_until);
create table public.audit_log (
 sequence bigint generated always as identity primary key, org_id uuid not null references organizations(id),
 actor_id uuid, action text not null, object_id uuid, outcome text not null, request_id uuid,
 created_at timestamptz not null default now()
);

create function private.can_case(o uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(o) and (private.has_capability(o,'coordinate') or private.has_capability(o,'expert')
 or private.has_capability(o,'evidence_view') or exists(select 1 from public.cases where org_id=o and id=c and created_by=auth.uid())
 or exists(select 1 from public.tasks where org_id=o and case_id=c and assignee_id=auth.uid()));
$$;
create function private.immutable_record() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'Immutable scientific record: create a new version'; end;
$$;
do $$ declare t text; begin
 foreach t in array array['report_versions','case_events','calibration_events','protocol_versions','background_versions','transport_versions',
 'reading_versions','quality_decisions','assessments','assessment_publications','assessment_dependencies','class_results','expert_decisions','evidence_packages','audit_log'] loop
 execute format('create trigger immutable before update or delete on public.%I for each row execute function private.immutable_record()',t);
 end loop;
 for t in select tablename from pg_tables where schemaname='public' loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;

-- A narrow server-command role can invoke explicit RPCs; direct REST remains read-only under RLS.
grant usage on schema private to authenticated;
revoke all on all tables in schema public from anon,authenticated;
grant select on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke all on all functions in schema private from public,anon;
grant execute on function private.is_member(uuid),private.has_capability(uuid,text),private.can_case(uuid,uuid) to authenticated;

create policy org_read on organizations for select to authenticated using(private.is_member(id));
create policy profile_own on profiles for select to authenticated using(id=(select auth.uid()));
create policy member_read on memberships for select to authenticated using(user_id=(select auth.uid()) or private.has_capability(org_id,'admin'));
create policy capability_read on member_capabilities for select to authenticated using(private.is_member(org_id));
create policy qualification_read on qualifications for select to authenticated using(private.is_member(org_id));
create policy case_read on cases for select to authenticated using(private.can_case(org_id,id));
create policy report_read on reports for select to authenticated using(private.is_member(org_id) and (reporter_id=(select auth.uid()) or private.has_capability(org_id,'coordinate') or private.has_capability(org_id,'expert') or private.has_capability(org_id,'evidence_view')));
create policy media_read on media_assets for select to authenticated using(private.is_member(org_id) and (owner_id=(select auth.uid()) or private.has_capability(org_id,'coordinate') or private.has_capability(org_id,'expert')));
create policy report_version_read on report_versions for select to authenticated using(exists(select 1 from reports r where r.id=report_id and r.org_id=report_versions.org_id));
create policy own_notifications on notifications for select to authenticated using(user_id=(select auth.uid()) and private.is_member(org_id));
create policy own_follows on follows for select to authenticated using(user_id=(select auth.uid()) and private.is_member(org_id));
create policy own_ai on ai_runs for select to authenticated using(owner_id=(select auth.uid()) and private.is_member(org_id));
create policy own_import on import_jobs for select to authenticated using(owner_id=(select auth.uid()) and private.is_member(org_id));
create policy own_idempotency on idempotency_keys for select to authenticated using(actor_id=(select auth.uid()));
do $$ declare t text; begin
 foreach t in array array['case_reports','case_events','network_versions','stations','access_records','context_features','tasks','reading_versions','analysis_jobs','assessments','task_proposals','expert_decisions'] loop
 execute format('create policy case_scope on public.%I for select to authenticated using(private.can_case(org_id,case_id))',t);
 end loop;
 foreach t in array array['waterways','network_nodes','network_edges','instruments','calibration_events','protocol_versions','background_versions','transport_versions','water_condition_groups','instrument_bookings','visits','quality_decisions','task_submissions','assessment_publications','assessment_dependencies','class_results','recommendations','evidence_packages','recipients','deliveries','revision_notices','audit_log'] loop
 execute format('create policy evidence_scope on public.%I for select to authenticated using(private.has_capability(org_id,''coordinate'') or private.has_capability(org_id,''expert'') or private.has_capability(org_id,''evidence_view''))',t);
 end loop;
end $$;

-- Private objects are never made public by a contributor visibility toggle.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('evidence-private','evidence-private',false,15728640,array['image/jpeg','image/png','image/webp','image/heic','application/json','application/pdf','text/html','application/geo+json'])
 on conflict(id) do nothing;
