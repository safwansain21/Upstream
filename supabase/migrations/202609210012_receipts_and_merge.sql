-- Contribution receipts: what each person's contribution actually did in a specific approved assessment (B12, B13).
create table public.contribution_receipts (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), user_id uuid not null references auth.users(id),
 case_id uuid not null, assessment_id uuid not null, report_id uuid, reading_id uuid,
 effect text not null check(effect in ('recorded_for_triage','used_in_assessment','excluded_after_review','history_only')),
 co_dependencies integer not null default 0, retained_before_m numeric, retained_after_m numeric,
 created_at timestamptz not null default now(),
 foreign key(org_id,case_id) references cases(org_id,id), foreign key(org_id,assessment_id) references assessments(org_id,id),
 check(report_id is not null or reading_id is not null)
);
create index receipts_user on public.contribution_receipts(user_id,created_at desc);
alter table public.contribution_receipts enable row level security;
create policy own_receipts on public.contribution_receipts for select to authenticated using(user_id=(select auth.uid()) and private.is_member(org_id));
grant select on public.contribution_receipts to authenticated;
create trigger immutable before update or delete on public.contribution_receipts for each row execute function private.immutable_record();

-- Receipts are append-only facts about one approved assessment; revision is derived from that assessment's publication status.
create function private.write_receipts(o uuid,aid uuid,prior uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.assessments; before numeric; used integer;
begin
 select * into a from public.assessments where id=aid;
 select retained_length_m into before from public.assessments where id=prior;
 select count(*) into used from public.assessment_dependencies where assessment_id=aid and entity_type='reading_version';
 insert into public.contribution_receipts(org_id,user_id,case_id,assessment_id,report_id,effect,retained_before_m,retained_after_m)
 select o,r.reporter_id,a.case_id,aid,r.id,'recorded_for_triage',before,a.retained_length_m
 from public.case_reports cr join public.reports r on r.id=cr.report_id where cr.case_id=a.case_id and r.reporter_id is not null;
 insert into public.contribution_receipts(org_id,user_id,case_id,assessment_id,reading_id,effect,co_dependencies,retained_before_m,retained_after_m)
 select o,v.operator_id,a.case_id,aid,v.id,case when d.entity_id is null then 'history_only'
  when (select q.disposition from public.quality_decisions q where q.reading_id=v.id order by q.created_at desc limit 1) in ('excluded','suspect') then 'excluded_after_review'
  else 'used_in_assessment' end,
  greatest(used-1,0),before,a.retained_length_m
 from public.reading_versions v left join public.assessment_dependencies d on d.assessment_id=aid and d.entity_type='reading_version' and d.entity_id=v.id
 where v.case_id=a.case_id and v.operator_id is not null;
 insert into public.notifications(org_id,user_id,type,object_id,object_version,message,dedupe_key)
 select distinct o,x.user_id,'contribution_effect',aid,a.revision,'An assessment using your contribution was approved. See what it changed.','receipt:'||aid||':'||x.user_id
 from public.contribution_receipts x where x.assessment_id=aid on conflict do nothing;
end $$;

-- Coordinator merge: both reports and their attribution are preserved; the merged case becomes an immutable redirect (B09).
create function public.merge_case(o uuid,src uuid,dst uuid,expected integer,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.cases; d public.cases; n integer;
begin
 perform private.assert_capability(o,'coordinate');
 if length(coalesce(reason,''))<10 then raise exception 'VALIDATION_FAILED: Provide a merge rationale of at least 10 characters'; end if;
 if src=dst then raise exception 'VALIDATION_FAILED: Choose a different investigation'; end if;
 select * into s from public.cases where org_id=o and id=src for update;
 select * into d from public.cases where org_id=o and id=dst for update;
 if s.id is null or d.id is null then raise exception 'NOT_FOUND'; end if;
 if s.version<>expected then raise exception 'VERSION_CONFLICT'; end if;
 if s.merged_into is not null or d.merged_into is not null then raise exception 'VERSION_CONFLICT: Investigation already merged'; end if;
 insert into public.case_reports(org_id,case_id,report_id) select o,dst,cr.report_id from public.case_reports cr where cr.case_id=src on conflict do nothing;
 get diagnostics n = row_count;
 update public.cases set merged_into=dst,version=version+1,updated_at=now() where id=src;
 update public.cases set version=version+1,updated_at=now() where id=dst;
 perform private.record_event(o,src,'case.merged_into',dst,null,jsonb_build_object('reason',reason));
 perform private.record_event(o,dst,'case.merged_from',src,null,jsonb_build_object('reports',n,'reason',reason));
 return jsonb_build_object('merged',src,'into',dst,'reports_linked',n);
end $$;
revoke all on function public.merge_case(uuid,uuid,uuid,integer,text) from public,anon;
grant execute on function public.merge_case(uuid,uuid,uuid,integer,text) to authenticated;
revoke all on all functions in schema private from public,anon;

create or replace function public.approve_assessment(o uuid,aid uuid,current_hash text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.assessments; c public.cases; prior uuid;
begin
 perform private.assert_capability(o,'expert');
 if length(coalesce(reason,''))<10 then raise exception 'VALIDATION_FAILED: Provide an approval rationale of at least 10 characters'; end if;
 select * into a from public.assessments where org_id=o and id=aid;
 if not found then raise exception 'NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtext(a.case_id::text)); -- same lock the API took before recomputing current_hash
 select * into c from public.cases where id=a.case_id for update;
 if private.publication_status(aid)<>'draft' then raise exception 'VERSION_CONFLICT: Only a draft assessment can be approved'; end if;
 if a.snapshot_hash<>current_hash then raise exception 'DEPENDENCY_CHANGED: Evidence or assumptions changed since this assessment was computed; recompute and review again'; end if;
 if c.review_hold and exists(select 1 from public.assessments x where x.case_id=c.id and private.publication_status(x.id)='under_review' and x.revision>a.revision) then
  raise exception 'VERSION_CONFLICT: A newer assessment is under review';
 end if;
 prior:=c.current_assessment_id;
 if prior is not null and prior<>aid then
  insert into public.assessment_publications(org_id,assessment_id,status,reason,actor_id) values(o,prior,'superseded','Superseded by assessment revision '||a.revision,auth.uid());
 end if;
 insert into public.assessment_publications(org_id,assessment_id,status,reason,actor_id) values(o,aid,'approved',reason,auth.uid());
 update public.cases set current_assessment_id=aid,review_hold=false,updated_at=now(),version=version+1 where id=c.id;
 perform private.record_event(o,a.case_id,'assessment.approved',aid,a.revision,jsonb_build_object('supersedes',prior));
 perform private.write_receipts(o,aid,prior);
 insert into public.notifications(org_id,user_id,type,object_id,object_version,message,dedupe_key)
 select o,f.user_id,'assessment_superseded',aid,a.revision,'An investigation you follow has a newly approved assessment.','approved:'||aid||':'||f.user_id
 from public.follows f where f.case_id=a.case_id on conflict do nothing;
 return jsonb_build_object('id',aid,'status','approved','supersedes',prior);
end $$;
