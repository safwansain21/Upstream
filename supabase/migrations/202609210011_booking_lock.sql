-- Serialize instrument bookings per instrument.
create or replace function public.assign_task(o uuid,tid uuid,expected integer,person uuid,meter uuid,claim boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
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
  -- Concurrent exclusion-constraint inserts can deadlock; serialize per instrument so the loser gets a clean conflict (D03).
  perform pg_advisory_xact_lock(hashtext('instrument:'||meter::text));
  insert into public.instrument_bookings(org_id,instrument_id,task_id,during) values(o,meter,tid,tstzrange(task.window_start,task.window_end,'[)'));
 end if;
 update public.tasks set assignee_id=person,instrument_id=meter,state='assigned',version=version+1 where id=tid returning * into task;
 perform private.record_event(o,task.case_id,'task.assigned',tid,task.version);
 insert into public.notifications(org_id,user_id,type,object_id,object_version,message,dedupe_key) values(o,person,'assignment',tid,task.version,'A field task is ready for your review.','task:'||tid||':'||task.version);
 return to_jsonb(task);
end $$;
