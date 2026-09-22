-- Organization-adjustable report rate limit within a fixed server cap.
create or replace function public.submit_report(o uuid,idem uuid,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 -- Default 20 reports/hour per user; an organization may adjust it within the server cap of 200 (PRD 14).
 if (select count(*) from public.reports where reporter_id=actor and created_at>now()-interval '1 hour')>=
    least(coalesce((select (intake_policy->>'reports_per_hour')::integer from public.organizations where id=o),20),200) then raise exception 'RATE_LIMITED'; end if;
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
