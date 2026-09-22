-- Expert review: publication events are append-only; assessments themselves never change (F01).

-- Latest publication status per assessment.
create function private.publication_status(aid uuid) returns text language sql stable security definer set search_path='' as $$
 select status from public.assessment_publications where assessment_id=aid order by created_at desc, id desc limit 1;
$$;

-- Suspect/excluded evidence puts every approved/current assessment that used it under review and flags tasks derived from it (F04, D11).
create function private.propagate_evidence_change(o uuid, rid uuid, why text) returns integer language plpgsql security definer set search_path='' as $$
declare a record; n integer:=0;
begin
 for a in select distinct s.id, s.case_id, s.snapshot_hash from public.assessment_dependencies d join public.assessments s on s.id=d.assessment_id
   where d.org_id=o and d.entity_type='reading_version' and d.entity_id=rid
   and private.publication_status(s.id) in ('approved','draft') loop
  if private.publication_status(a.id)='approved' then
   insert into public.assessment_publications(org_id,assessment_id,status,reason,actor_id) values(o,a.id,'under_review',why,auth.uid());
   update public.cases set review_hold=true,updated_at=now() where id=a.case_id;
   n:=n+1;
  end if;
  update public.tasks set state='needs_revision',reason='Evidence behind this task changed: '||why,version=version+1
   where org_id=o and rationale_hash=a.snapshot_hash and state in ('proposed','assigned','accepted');
  perform private.record_event(o,a.case_id,'assessment.under_review',a.id,null,jsonb_build_object('reading',rid,'reason',why));
 end loop;
 return n;
end $$;

create or replace function public.record_quality(o uuid,rid uuid,disposition text,reason text,comparable boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reading_versions; affected integer:=0;
begin
 if length(coalesce(reason,''))<10 then raise exception 'VALIDATION_FAILED: Provide a rationale of at least 10 characters'; end if;
 if disposition not in ('accepted','suspect','excluded') then raise exception 'VALIDATION_FAILED: Unknown disposition'; end if;
 if not private.has_capability(o,'expert') and not (disposition='suspect' and private.has_capability(o,'coordinate')) then
  raise exception 'FORBIDDEN: Expert review capability required' using errcode='42501';
 end if;
 select * into r from public.reading_versions where org_id=o and id=rid;
 if not found then raise exception 'NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtext(r.case_id::text)); -- serializes with approval's dependency check (F02)
 if disposition='accepted' and not r.eligible then raise exception 'READINESS_REQUIRED: This reading is history-only: %', array_to_string(r.ineligibility_reasons,'; '); end if;
 insert into public.quality_decisions(org_id,reading_id,disposition,reason,reviewer_id,comparable) values(o,rid,disposition,reason,auth.uid(),comparable);
 if disposition in ('suspect','excluded') then affected:=private.propagate_evidence_change(o,rid,'reading '||disposition||': '||reason); end if;
 perform private.record_event(o,r.case_id,'reading.'||disposition,rid,r.version,jsonb_build_object('comparable',comparable));
 return jsonb_build_object('reading_id',rid,'disposition',disposition,'comparable',comparable,'assessments_under_review',affected);
end $$;

-- Later verification failure: readings in the affected interval become suspect for review; nothing is deleted (D11).
create function public.flag_instrument_failure(o uuid,inst uuid,from_at timestamptz,until_at timestamptz,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; n integer:=0; held integer:=0;
begin
 perform private.assert_capability(o,'expert');
 for r in select v.id,v.case_id from public.reading_versions v where v.org_id=o and v.instrument_id=inst and v.measured_at>=from_at and v.measured_at<=coalesce(until_at,now())
   and coalesce((select disposition from public.quality_decisions q where q.reading_id=v.id order by created_at desc limit 1),'submitted') not in ('suspect','excluded') loop
  perform pg_advisory_xact_lock(hashtext(r.case_id::text));
  insert into public.quality_decisions(org_id,reading_id,disposition,reason,reviewer_id,affected_interval)
  values(o,r.id,'suspect','Instrument verification failed: '||reason,auth.uid(),tstzrange(from_at,coalesce(until_at,now()),'[]'));
  held:=held+private.propagate_evidence_change(o,r.id,'instrument verification failed: '||reason);
  perform private.record_event(o,r.case_id,'reading.suspect',r.id,null,jsonb_build_object('instrument',inst));
  n:=n+1;
 end loop;
 return jsonb_build_object('suspect_readings',n,'assessments_under_review',held);
end $$;

create function public.review_assessment(o uuid,aid uuid,action text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.assessments; st text;
begin
 -- Approval and other scientific review decisions need expert capability; admin alone is not enough (F03).
 perform private.assert_capability(o,'expert');
 if length(coalesce(reason,''))<10 then raise exception 'VALIDATION_FAILED: Provide a review rationale of at least 10 characters'; end if;
 if action not in ('reject','more_evidence') then raise exception 'VALIDATION_FAILED: Unknown review action'; end if;
 select * into a from public.assessments where org_id=o and id=aid;
 if not found then raise exception 'NOT_FOUND'; end if;
 perform 1 from public.cases where id=a.case_id for update;
 st:=private.publication_status(aid);
 if st<>'draft' then raise exception 'VERSION_CONFLICT: Assessment is %, not a draft', st; end if;
 insert into public.assessment_publications(org_id,assessment_id,status,reason,actor_id)
 values(o,aid,case when action='reject' then 'rejected' else 'more_evidence' end,reason,auth.uid());
 perform private.record_event(o,a.case_id,'assessment.'||action,aid,a.revision);
 return jsonb_build_object('id',aid,'status',case when action='reject' then 'rejected' else 'more_evidence' end);
end $$;

-- Approval: caller has already recomputed the dependency snapshot inside this transaction (case row locked) and passes the hash.
create function public.approve_assessment(o uuid,aid uuid,current_hash text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 insert into public.notifications(org_id,user_id,type,object_id,object_version,message,dedupe_key)
 select o,f.user_id,'assessment_superseded',aid,a.revision,'An investigation you follow has a newly approved assessment.','approved:'||aid||':'||f.user_id
 from public.follows f where f.case_id=a.case_id on conflict do nothing;
 return jsonb_build_object('id',aid,'status','approved','supersedes',prior);
end $$;

create function public.record_decision(o uuid,cid uuid,expected integer,action text,rationale text,aid uuid,segments text[],context text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cases;
begin
 perform private.assert_capability(o,'expert');
 if length(coalesce(rationale,''))<10 then raise exception 'VALIDATION_FAILED: Provide a rationale of at least 10 characters'; end if;
 if action not in ('inspection_recommended','escalated','closed_no_anomaly','closed_insufficient','triage') then raise exception 'VALIDATION_FAILED: Unknown decision'; end if;
 select * into c from public.cases where org_id=o and id=cid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if c.version<>expected then raise exception 'VERSION_CONFLICT'; end if;
 -- An inspection recommendation is a separate expert decision; it never alters localization results (F10).
 insert into public.expert_decisions(org_id,case_id,assessment_id,actor_id,action,rationale,segments,context_sources)
 values(o,cid,aid,auth.uid(),action,rationale,coalesce(segments,'{}'),coalesce(context,'{}'));
 update public.cases set workflow=action,version=version+1,updated_at=now() where id=cid returning * into c;
 perform private.record_event(o,cid,'decision.'||action,aid,c.version);
 return jsonb_build_object('case_id',cid,'workflow',c.workflow,'version',c.version);
end $$;

revoke all on function public.flag_instrument_failure(uuid,uuid,timestamptz,timestamptz,text),public.review_assessment(uuid,uuid,text,text),
 public.approve_assessment(uuid,uuid,text,text),public.record_decision(uuid,uuid,integer,text,text,uuid,text[],text[]) from public,anon;
grant execute on function public.flag_instrument_failure(uuid,uuid,timestamptz,timestamptz,text),public.review_assessment(uuid,uuid,text,text),
 public.approve_assessment(uuid,uuid,text,text),public.record_decision(uuid,uuid,integer,text,text,uuid,text[],text[]),
 public.record_quality(uuid,uuid,text,text,boolean) to authenticated;
revoke all on all functions in schema private from public,anon;
grant execute on function private.publication_status(uuid) to authenticated;

-- Network publication changes dependencies too: take the same per-case lock.
create or replace function public.create_task(o uuid,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.tasks;
begin
 perform private.assert_capability(o,'coordinate');
 if body->>'station_id' is not null and not exists(select 1 from public.stations where org_id=o and id=(body->>'station_id')::uuid and case_id=(body->>'case_id')::uuid) then
  raise exception 'VALIDATION_FAILED: Station is not part of this case';
 end if;
 insert into public.tasks(org_id,case_id,task_type,purpose,limitations,station_id,protocol_id,window_start,window_end,estimated_minutes,rationale_hash)
 values(o,(body->>'case_id')::uuid,body->>'task_type',body->>'purpose',
  coalesce(nullif(body->>'limitations',''),'Evidence may not narrow the retained area. Use approved access points.'),
  (body->>'station_id')::uuid,(body->>'protocol_id')::uuid,(body->>'window_start')::timestamptz,(body->>'window_end')::timestamptz,
  coalesce((body->>'estimated_minutes')::integer,30),nullif(body->>'rationale_hash','')) returning * into task;
 perform private.record_event(o,task.case_id,'task.proposed',task.id,1);
 return to_jsonb(task);
end $$;

-- Network publication changes an assessment dependency: take the per-case approval lock.
create or replace function public.publish_network(o uuid,nid uuid,reason text,evidence text[],boundary text,mixing boolean,domain_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.network_versions; prior uuid;
begin
 -- Publishing needs verification qualification; organization admin alone is not enough.
 perform private.assert_capability(o,'network_verify');
 if length(coalesce(reason,''))<10 or coalesce(cardinality(evidence),0)=0 then
  raise exception 'VALIDATION_FAILED: Record the verification rationale and at least one evidence reference'; end if;
 if boundary not in ('closed','open','unknown') then raise exception 'VALIDATION_FAILED: Unknown boundary treatment'; end if;
 select * into n from public.network_versions where org_id=o and id=nid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if n.status<>'proposed' then raise exception 'VERSION_CONFLICT: Only a draft can be published'; end if;
 perform pg_advisory_xact_lock(hashtext(n.case_id::text)); -- serialize with assessment approval
 select network_id into prior from public.cases where org_id=o and id=n.case_id for update;
 update public.network_versions set status='reviewed',reviewed_by=auth.uid(),review_reason=reason,evidence_refs=evidence,
  boundary_treatment=boundary,mixing_reviewed=mixing,domain_note=publish_network.domain_note,published_at=now(),supersedes_id=prior
  where id=nid returning * into n;
 update public.cases set network_id=nid,updated_at=now(),version=version+1 where id=n.case_id;
 perform private.record_event(o,n.case_id,'network.published',nid,n.version,jsonb_build_object('supersedes',prior,'evidence',evidence));
 return jsonb_build_object('id',nid,'version',n.version,'status',n.status,'supersedes',prior);
end $$;
