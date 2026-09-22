create function private.assert_capability(o uuid,c text) returns void language plpgsql security definer set search_path='' as $$
begin if not private.has_capability(o,c) then raise exception 'FORBIDDEN' using errcode='42501'; end if; end $$;
create function private.record_event(o uuid,c uuid,event text,object_id uuid,object_version integer,payload jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.case_events(org_id,case_id,event_type,actor_id,object_id,object_version,payload)
 values(o,c,event,auth.uid(),object_id,object_version,payload);
 insert into public.audit_log(org_id,actor_id,action,object_id,outcome) values(o,auth.uid(),event,object_id,'accepted');
end $$;

create function public.submit_report(o uuid,idem uuid,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); reqhash text; prior public.idempotency_keys; cid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); wid uuid; result jsonb; origin text; membership_status text;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.organizations where id=o and intake_enabled) and not private.is_member(o) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select status into membership_status from public.memberships where org_id=o and user_id=actor;
 if membership_status='revoked' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if body ?| array['data_origin','reporter_id','quality','assessment_id','source_probability'] then raise exception 'VALIDATION_FAILED'; end if;
 if length(coalesce(body->>'description',''))>2000 or (length(coalesce(body->>'description',''))<10 and jsonb_array_length(coalesce(body->'categories','[]'))=0) then raise exception 'VALIDATION_FAILED'; end if;
 if (body->>'latitude') is null and length(coalesce(body->>'landmark',''))=0 then raise exception 'VALIDATION_FAILED'; end if;
 if (body->>'latitude')::numeric not between -90 and 90 or (body->>'longitude')::numeric not between -180 and 180 then raise exception 'VALIDATION_FAILED'; end if;
 reqhash:=encode(extensions.digest(body::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(actor::text||idem::text,0));
 select * into prior from public.idempotency_keys where actor_id=actor and operation='report.create' and key=idem;
 if found then if prior.request_hash<>reqhash then raise exception 'IDEMPOTENCY_MISMATCH'; end if; return prior.response; end if;
 if (select count(*) from public.reports where reporter_id=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'RATE_LIMITED'; end if;
 insert into public.memberships(org_id,user_id) values(o,actor) on conflict(org_id,user_id) do nothing;
 select case when example then 'synthetic' else 'real' end into origin from public.organizations where id=o;
 wid:=(body->>'waterway_id')::uuid;
 if coalesce((body->>'unmapped')::boolean,false) or body->>'local_name' is not null then
  insert into public.waterways(org_id,local_name) values(o,body->>'local_name') returning id into wid;
 end if;
 insert into public.cases(id,org_id,title,created_by,waterway_id,data_origin,locality)
 values(cid,o,coalesce(nullif(body->>'local_name',''),'Unnamed stream'),actor,wid,origin,body->>'landmark');
 insert into public.reports(id,org_id,case_id,reporter_id,client_id,categories,description,observed_at,timezone,location,landmark,location_precision,accuracy_m,location_method,waterway_id,public_visibility,data_origin)
 values(rid,o,cid,actor,(body->>'client_id')::uuid,array(select jsonb_array_elements_text(coalesce(body->'categories','[]'))),coalesce(body->>'description',''),(body->>'observed_at')::timestamptz,body->>'timezone',
 case when body->>'latitude' is not null then extensions.st_setsrid(extensions.st_makepoint((body->>'longitude')::double precision,(body->>'latitude')::double precision),4326) end,
 coalesce(body->>'landmark',''),case when body->>'latitude' is null then 'unresolved' else coalesce(body->>'location_precision','approximate') end,
 (body->>'accuracy_m')::numeric,coalesce(body->>'location_method','landmark'),wid,coalesce((body->>'public_visibility')::boolean,false),origin);
 if jsonb_array_length(coalesce(body->'media_ids','[]'))>5 then raise exception 'VALIDATION_FAILED'; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(body->'media_ids','[]')) x where not exists(select 1 from public.media_assets m where m.id=x::uuid and m.owner_id=actor and m.org_id=o and m.report_id is null and m.scan_state='ready')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 update public.media_assets set report_id=rid where id in(select x::uuid from jsonb_array_elements_text(coalesce(body->'media_ids','[]')) x);
 insert into public.report_versions(org_id,report_id,version,content,content_hash,created_by) values(o,rid,1,body,reqhash,actor);
 insert into public.case_reports(org_id,case_id,report_id) values(o,cid,rid);
 perform private.record_event(o,cid,'report.received',rid,1,jsonb_build_object('data_origin',origin));
 insert into public.notifications(org_id,user_id,type,object_id,object_version,message,dedupe_key) values(o,actor,'report_receipt',rid,1,'Your report has been received for review. The cause is not established.','report:'||rid);
 result:=jsonb_build_object('id',rid,'case_id',cid,'org_id',o,'version',1,'state','server_received','data_origin',origin,'message','Your report has been received for review. The cause is not established.');
 insert into public.idempotency_keys values(actor,'report.create',idem,reqhash,result,201,now());
 return result;
end $$;

create function public.create_task(o uuid,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.tasks;
begin
 perform private.assert_capability(o,'coordinate');
 insert into public.tasks(org_id,case_id,task_type,purpose,station_id,protocol_id,window_start,window_end,estimated_minutes)
 values(o,(body->>'case_id')::uuid,body->>'task_type',body->>'purpose',(body->>'station_id')::uuid,(body->>'protocol_id')::uuid,(body->>'window_start')::timestamptz,(body->>'window_end')::timestamptz,coalesce((body->>'estimated_minutes')::integer,30)) returning * into task;
 perform private.record_event(o,task.case_id,'task.proposed',task.id,1);
 return to_jsonb(task);
end $$;

create function public.assign_task(o uuid,tid uuid,expected integer,person uuid,meter uuid,claim boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.tasks; qualified boolean; needs_meter boolean;
begin
 if claim then if person<>auth.uid() or not private.is_member(o) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 else perform private.assert_capability(o,'coordinate'); end if;
 select * into task from public.tasks where org_id=o and id=tid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if task.version<>expected or task.state not in ('proposed','declined','needs_revision') then raise exception 'VERSION_CONFLICT'; end if;
 if task.window_end<=now() then raise exception 'VALIDATION_FAILED: Task window expired'; end if;
 if not exists(select 1 from public.memberships where org_id=o and user_id=person and status='active') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 needs_meter:=task.task_type in ('baseline_reading','anchor_reading','conductance_reading','coordinated_pair','instrument_check');
 if needs_meter or task.task_type in ('mapping_verification','expert_review') then
  select exists(select 1 from public.qualifications q join public.memberships m on m.id=q.membership_id where m.org_id=o and m.user_id=person and m.status='active' and q.task_type=task.task_type and q.valid_from<=task.window_start and q.valid_until>=task.window_end) into qualified;
  if not qualified then raise exception 'FORBIDDEN: Qualification required' using errcode='42501'; end if;
 end if;
 if task.station_id is not null and not exists(select 1 from public.stations where org_id=o and id=task.station_id and access_status='open' and status='approved') then raise exception 'READINESS_REQUIRED: Access not verified'; end if;
 if needs_meter then
  if meter is null or not exists(select 1 from public.instruments where org_id=o and id=meter and available) then raise exception 'READINESS_REQUIRED: Instrument unavailable'; end if;
  if not exists(select 1 from public.calibration_events where org_id=o and instrument_id=meter and status='pass' and effective_from<=task.window_start and effective_until>=task.window_end) then raise exception 'READINESS_REQUIRED: Instrument verification required'; end if;
  insert into public.instrument_bookings(org_id,instrument_id,task_id,during) values(o,meter,tid,tstzrange(task.window_start,task.window_end,'[)'));
 end if;
 update public.tasks set assignee_id=person,instrument_id=meter,state='assigned',version=version+1 where id=tid returning * into task;
 perform private.record_event(o,task.case_id,'task.assigned',tid,task.version);
 insert into public.notifications(org_id,user_id,type,object_id,object_version,message,dedupe_key) values(o,person,'assignment',tid,task.version,'A field task is ready for your review.','task:'||tid||':'||task.version);
 return to_jsonb(task);
end $$;

create function public.transition_task(o uuid,tid uuid,expected integer,action text,reason text,outcome text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.tasks; next_state text;
begin
 if not private.is_member(o) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into task from public.tasks where org_id=o and id=tid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if task.version<>expected then raise exception 'VERSION_CONFLICT'; end if;
 if action in ('cancel','complete') then perform private.assert_capability(o,'coordinate');
 elsif task.assignee_id is distinct from auth.uid() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if action='accept' and task.state='assigned' then next_state:='accepted';
 elsif action='start' and task.state='accepted' then next_state:='in_progress';
 elsif action='submit' and task.state in ('accepted','in_progress') then next_state:='submitted';
 elsif action='decline' and task.state in ('assigned','accepted') and length(reason)>=5 then next_state:='declined';
 elsif action='block' and task.state in ('assigned','accepted','in_progress') and length(reason)>=5 then next_state:='blocked';
 elsif action='cancel' and task.state not in ('completed','cancelled') and length(reason)>=5 then next_state:='cancelled';
 elsif action='complete' and task.state='submitted' and length(reason)>=5 then next_state:='completed';
 else raise exception 'VERSION_CONFLICT: Invalid task transition'; end if;
 update public.tasks set state=next_state,version=version+1,reason=transition_task.reason where id=tid returning * into task;
 if next_state in ('declined','blocked','cancelled','completed') then update public.instrument_bookings set active=false where task_id=tid; end if;
 if next_state='submitted' then insert into public.task_submissions(org_id,task_id,submitter_id,outcome) values(o,tid,auth.uid(),outcome); end if;
 perform private.record_event(o,task.case_id,'task.'||next_state,tid,task.version);
 return to_jsonb(task);
end $$;

create function public.update_profile(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.profiles;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if exists(select 1 from jsonb_object_keys(body) key where key not in ('display_name','locale','motion_preference','simplify_map')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 insert into public.profiles(id) values(auth.uid()) on conflict(id) do nothing;
 update public.profiles set display_name=coalesce(body->>'display_name',display_name),locale=coalesce(body->>'locale',locale),motion_preference=coalesce(body->>'motion_preference',motion_preference),simplify_map=coalesce((body->>'simplify_map')::boolean,simplify_map) where id=auth.uid() returning * into result;
 return to_jsonb(result);
end $$;

create function public.report_visibility(o uuid,rid uuid,expected integer,visible boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare report public.reports;
begin
 if not private.is_member(o) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into report from public.reports where org_id=o and id=rid and reporter_id=auth.uid() for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if report.version<>expected then raise exception 'VERSION_CONFLICT'; end if;
 update public.reports set public_visibility=visible,version=version+1 where id=rid returning * into report;
 perform private.record_event(o,report.case_id,'report.visibility_changed',rid,report.version);
 return jsonb_build_object('id',rid,'version',report.version,'public_visibility',visible);
end $$;

-- Case ownership permits metadata, not unrestricted internal scientific evidence.
drop policy case_scope on reading_versions;
create policy reading_scope on reading_versions for select to authenticated using(private.is_member(org_id) and (operator_id=auth.uid() or private.has_capability(org_id,'expert') or private.has_capability(org_id,'coordinate') or private.has_capability(org_id,'evidence_view')));
drop policy case_scope on assessments;
create policy assessment_scope on assessments for select to authenticated using(private.has_capability(org_id,'expert') or private.has_capability(org_id,'coordinate') or private.has_capability(org_id,'evidence_view') or exists(select 1 from public.tasks t where t.org_id=assessments.org_id and t.case_id=assessments.case_id and t.assignee_id=auth.uid()));
drop policy case_scope on analysis_jobs;
create policy job_scope on analysis_jobs for select to authenticated using(private.has_capability(org_id,'expert') or private.has_capability(org_id,'coordinate'));

revoke all on all functions in schema private from public,anon;
revoke all on function public.submit_report(uuid,uuid,jsonb),public.create_task(uuid,jsonb),public.assign_task(uuid,uuid,integer,uuid,uuid,boolean),public.transition_task(uuid,uuid,integer,text,text,text),public.update_profile(jsonb),public.report_visibility(uuid,uuid,integer,boolean) from public,anon;
grant execute on function public.submit_report(uuid,uuid,jsonb),public.create_task(uuid,jsonb),public.assign_task(uuid,uuid,integer,uuid,uuid,boolean),public.transition_task(uuid,uuid,integer,text,text,text),public.update_profile(jsonb),public.report_visibility(uuid,uuid,integer,boolean) to authenticated;
