-- Field work: access reports, replicate capture, QC decisions. Authority stays in these RPCs, never in client state.

-- Comparability is a reviewer decision recorded with QC, not a property the field client can assert.
alter table public.quality_decisions add column comparable boolean;

-- A task station must belong to the task's case (composite FK only proves same organization).
create or replace function public.create_task(o uuid,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.tasks;
begin
 perform private.assert_capability(o,'coordinate');
 if body->>'station_id' is not null and not exists(select 1 from public.stations where org_id=o and id=(body->>'station_id')::uuid and case_id=(body->>'case_id')::uuid) then
  raise exception 'VALIDATION_FAILED: Station is not part of this case';
 end if;
 insert into public.tasks(org_id,case_id,task_type,purpose,limitations,station_id,protocol_id,window_start,window_end,estimated_minutes)
 values(o,(body->>'case_id')::uuid,body->>'task_type',body->>'purpose',
  coalesce(nullif(body->>'limitations',''),'Evidence may not narrow the retained area. Use approved access points.'),
  (body->>'station_id')::uuid,(body->>'protocol_id')::uuid,(body->>'window_start')::timestamptz,(body->>'window_end')::timestamptz,coalesce((body->>'estimated_minutes')::integer,30)) returning * into task;
 perform private.record_event(o,task.case_id,'task.proposed',task.id,1);
 return to_jsonb(task);
end $$;

create function public.report_access(o uuid,sid uuid,status text,notes text) returns jsonb language plpgsql security definer set search_path='' as $$
declare st public.stations; blocked integer:=0; t record;
begin
 if not private.is_member(o) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if status not in ('open','closed','unknown') or length(coalesce(notes,''))<5 then raise exception 'VALIDATION_FAILED: Describe the access situation (5+ characters)'; end if;
 select * into st from public.stations where org_id=o and id=sid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 insert into public.access_records(org_id,case_id,station_id,status,notes,observed_at,created_by) values(o,st.case_id,sid,status,notes,now(),auth.uid());
 if status='closed' then
  -- Provisional block until a coordinator resolves it; a high planner score never overrides access (D13).
  update public.stations set access_status='closed',access_notes=notes,version=version+1 where id=sid;
  for t in update public.tasks set state='blocked',reason='Access reported closed: '||notes,version=version+1
   where org_id=o and station_id=sid and state in ('proposed','assigned','accepted') returning id,assignee_id,version,case_id loop
   blocked:=blocked+1;
   update public.instrument_bookings set active=false where task_id=t.id;
   perform private.record_event(o,t.case_id,'task.blocked',t.id,t.version);
   if t.assignee_id is not null then
    insert into public.notifications(org_id,user_id,type,object_id,object_version,message,dedupe_key)
    values(o,t.assignee_id,'task_change',t.id,t.version,'A task was blocked because access was reported closed.','task:'||t.id||':'||t.version);
   end if;
  end loop;
 elsif status='open' then
  perform private.assert_capability(o,'coordinate'); -- reopening is a coordinator resolution
  update public.stations set access_status='open',access_notes=notes,version=version+1 where id=sid;
 end if;
 perform private.record_event(o,st.case_id,'access.'||status,sid,null,jsonb_build_object('blocked_tasks',blocked));
 return jsonb_build_object('station_id',sid,'access_status',status,'blocked_tasks',blocked);
end $$;

create function public.submit_readings(o uuid,tid uuid,task_version integer,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); task public.tasks; proto jsonb; vid uuid:=gen_random_uuid(); rep jsonb; reasons text[]; cal uuid;
 rid uuid; results jsonb:='[]'; origin text; reqhash text; prior public.idempotency_keys; measured timestamptz; ids uuid[]:='{}'; result jsonb;
begin
 if actor is null or not private.is_member(o) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 reqhash:=encode(extensions.digest(body::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(actor::text||(body->>'client_id'),0));
 select * into prior from public.idempotency_keys where actor_id=actor and operation='readings.submit' and key=(body->>'client_id')::uuid;
 if found then if prior.request_hash<>reqhash then raise exception 'IDEMPOTENCY_MISMATCH'; end if; return prior.response; end if;
 select * into task from public.tasks where org_id=o and id=tid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if task.assignee_id is distinct from actor then raise exception 'FORBIDDEN: Only the assigned monitor can submit readings for this task' using errcode='42501'; end if;
 if task.state not in ('accepted','in_progress','submitted','needs_revision') then raise exception 'VERSION_CONFLICT: Task is %; readings were kept on your device', task.state; end if;
 if task.task_type not in ('baseline_reading','anchor_reading','conductance_reading','coordinated_pair','instrument_check') then raise exception 'VALIDATION_FAILED: This task does not take measurements'; end if;
 if body->>'mode' not in ('raw','meter_sc25') then raise exception 'VALIDATION_FAILED: Field readings are raw conductivity or meter-reported SC25'; end if;
 if body->>'unit' not in ('uS/cm','mS/cm') then raise exception 'VALIDATION_FAILED: Unit must be uS/cm or mS/cm'; end if;
 if jsonb_array_length(coalesce(body->'replicates','[]')) not between 1 and 20 then raise exception 'VALIDATION_FAILED: Provide 1 to 20 replicates'; end if;
 select configuration into proto from public.protocol_versions where org_id=o and id=task.protocol_id;
 select case when example then 'synthetic' else 'real' end into origin from public.organizations where id=o;
 insert into public.visits(id,org_id,task_id,station_id,instrument_id,operator_id,started_at,shared_effect_group)
 values(vid,o,tid,task.station_id,task.instrument_id,actor,(body->>'started_at')::timestamptz,'visit:'||vid);
 for rep in select * from jsonb_array_elements(body->'replicates') loop
  measured:=(rep->>'measured_at')::timestamptz;
  if measured>now()+interval '10 minutes' then raise exception 'VALIDATION_FAILED: Measurement time is in the future; check the device clock'; end if;
  if (rep->>'value')::numeric<0 then raise exception 'VALIDATION_FAILED: Conductivity cannot be negative'; end if;
  -- D05: a protocol reading needs a qualification valid when it was measured.
  if not exists(select 1 from public.qualifications q join public.memberships m on m.id=q.membership_id where m.org_id=o and m.user_id=actor
    and m.status='active' and q.task_type=task.task_type and q.valid_from<=measured and q.valid_until>=measured) then
   raise exception 'FORBIDDEN: Qualification required for this measurement' using errcode='42501';
  end if;
  reasons:='{}';
  select id into cal from public.calibration_events where org_id=o and instrument_id=task.instrument_id and status='pass'
   and effective_from<=measured and (effective_until is null or effective_until>=measured) order by checked_at desc limit 1;
  if cal is null then reasons:=array_append(reasons,('instrument verification not valid at measurement time: held for protocol review')::text); end if;
  if body->>'mode'='raw' and rep->>'temperature' is null then reasons:=array_append(reasons,('water temperature missing: history only')::text); end if;
  if body->>'mode'='raw' and cal is not null and (select bounds from public.calibration_events where id=cal) is null then
   reasons:=array_append(reasons,('calibration gain/offset/temperature bounds not recorded')::text); end if;
  if body->>'mode'='raw' and proto is not null and proto->'reading_bounds'->>'water_group' is null then
   reasons:=array_append(reasons,('no water-condition group for temperature compensation')::text); end if;
  if body->>'mode'='meter_sc25' then reasons:=array_append(reasons,('meter SC25 without documented invertible compensation: history only')::text); end if;
  if proto is null then reasons:=array_append(reasons,('no protocol uncertainty bounds for this task')::text); end if;
  if task_version<>task.version then reasons:=array_append(reasons,(('task revised after capture; submitted under task version '||task_version))::text); end if;
  if (rep->>'temperature')::numeric not between -2 and 45 and length(coalesce(rep->>'notes',''))<5 then
   raise exception 'VALIDATION_FAILED: Temperature % is unusual; confirm with a note', rep->>'temperature';
  end if;
  rid:=gen_random_uuid();
  insert into public.reading_versions(id,org_id,case_id,entity_id,version,visit_id,station_id,instrument_id,calibration_id,protocol_id,mode,value,unit,
   temperature,compensation,bounds,measured_at,quality,eligible,ineligibility_reasons,submitted_task_version,operator_id,data_origin,content_hash,notes)
  values(rid,o,task.case_id,gen_random_uuid(),1,vid,task.station_id,task.instrument_id,cal,task.protocol_id,body->>'mode',(rep->>'value')::numeric,body->>'unit',
   (rep->>'temperature')::numeric,jsonb_build_object('mode',coalesce(body->>'compensation_mode','none'),'coefficient',body->>'compensation_coefficient','meter_sc25',rep->>'meter_sc25'),
   coalesce(proto->'reading_bounds','{}')||jsonb_build_object('comparable',false),measured,'submitted',cardinality(reasons)=0,reasons,task_version,actor,origin,
   encode(extensions.digest(rep::text||vid::text,'sha256'),'hex'),coalesce(rep->>'notes',''));
  ids:=ids||rid;
  results:=results||jsonb_build_object('id',rid,'eligible',cardinality(reasons)=0,'reasons',to_jsonb(reasons));
  if cal is null then insert into public.audit_log(org_id,actor_id,action,object_id,outcome) values(o,actor,'reading.uncalibrated',rid,'held'); end if;
 end loop;
 update public.tasks set state='submitted',version=version+1 where id=tid and state in ('accepted','in_progress','needs_revision') returning * into task;
 insert into public.task_submissions(org_id,task_id,submitter_id,reading_ids,outcome) values(o,tid,actor,ids,'readings submitted');
 perform private.record_event(o,coalesce(task.case_id,(select case_id from public.tasks where id=tid)),'readings.submitted',vid,null,jsonb_build_object('count',cardinality(ids)));
 result:=jsonb_build_object('visit_id',vid,'readings',results,'state','received_pending_qc');
 insert into public.idempotency_keys values(actor,'readings.submit',(body->>'client_id')::uuid,reqhash,result,201,now());
 return result;
end $$;

create function public.record_quality(o uuid,rid uuid,disposition text,reason text,comparable boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reading_versions;
begin
 if length(coalesce(reason,''))<10 then raise exception 'VALIDATION_FAILED: Provide a rationale of at least 10 characters'; end if;
 if disposition not in ('accepted','suspect','excluded') then raise exception 'VALIDATION_FAILED: Unknown disposition'; end if;
 -- Coordinators may flag QC concerns; accepting/excluding scientific evidence needs expert capability (not admin alone).
 if not private.has_capability(o,'expert') and not (disposition='suspect' and private.has_capability(o,'coordinate')) then
  raise exception 'FORBIDDEN: Expert review capability required' using errcode='42501';
 end if;
 select * into r from public.reading_versions where org_id=o and id=rid;
 if not found then raise exception 'NOT_FOUND'; end if;
 if disposition='accepted' and not r.eligible then raise exception 'READINESS_REQUIRED: This reading is history-only: %', array_to_string(r.ineligibility_reasons,'; '); end if;
 insert into public.quality_decisions(org_id,reading_id,disposition,reason,reviewer_id,comparable) values(o,rid,disposition,reason,auth.uid(),comparable);
 perform private.record_event(o,r.case_id,'reading.'||disposition,rid,r.version,jsonb_build_object('comparable',comparable));
 return jsonb_build_object('reading_id',rid,'disposition',disposition,'comparable',comparable);
end $$;

revoke all on function public.report_access(uuid,uuid,text,text),public.submit_readings(uuid,uuid,integer,jsonb),public.record_quality(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.report_access(uuid,uuid,text,text),public.submit_readings(uuid,uuid,integer,jsonb),public.record_quality(uuid,uuid,text,text,boolean),public.create_task(uuid,jsonb) to authenticated;

-- "Available to me": proposed tasks a member could claim (qualified types need a current qualification).
create policy available_tasks on public.tasks for select to authenticated using(
 state='proposed' and private.is_member(org_id) and (
  task_type in ('location_confirmation','access_confirmation','repeat_imagery')
  or exists(select 1 from public.qualifications q join public.memberships m on m.id=q.membership_id
   where m.org_id=tasks.org_id and m.user_id=(select auth.uid()) and m.status='active' and q.task_type=tasks.task_type and q.valid_until>now())));

-- Monitors see their own visits (needed to read back their own submissions).
create policy own_visits on public.visits for select to authenticated using(operator_id=(select auth.uid()) and private.is_member(org_id));
