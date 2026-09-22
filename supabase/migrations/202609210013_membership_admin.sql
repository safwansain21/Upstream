-- Membership and capability administration through audited RPCs only (never client self-insert).
create function public.set_capability(o uuid,target uuid,cap text,grant_it boolean,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships;
begin
 perform private.assert_capability(o,'admin');
 if target=auth.uid() and grant_it then raise exception 'FORBIDDEN: Capabilities cannot be self-granted' using errcode='42501'; end if;
 if cap not in ('coordinate','expert','admin','network_verify','evidence_view','monitor') then raise exception 'VALIDATION_FAILED: Unknown capability'; end if;
 if length(coalesce(reason,''))<5 then raise exception 'VALIDATION_FAILED: Record why this capability changes'; end if;
 select * into m from public.memberships where org_id=o and user_id=target and status='active';
 if not found then raise exception 'NOT_FOUND'; end if;
 if grant_it then
  insert into public.member_capabilities(org_id,membership_id,capability,granted_by) values(o,m.id,cap,auth.uid()) on conflict(membership_id,capability) do nothing;
 else
  delete from public.member_capabilities where membership_id=m.id and capability=cap;
 end if;
 insert into public.audit_log(org_id,actor_id,action,object_id,outcome) values(o,auth.uid(),'capability.'||case when grant_it then 'granted' else 'revoked' end||':'||cap,target,'accepted');
 return jsonb_build_object('user_id',target,'capability',cap,'granted',grant_it);
end $$;

create function public.set_membership_status(o uuid,target uuid,new_status text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_capability(o,'admin');
 if new_status not in ('active','revoked') then raise exception 'VALIDATION_FAILED: Unknown status'; end if;
 if target=auth.uid() then raise exception 'FORBIDDEN: Administrators cannot change their own membership' using errcode='42501'; end if;
 if length(coalesce(reason,''))<5 then raise exception 'VALIDATION_FAILED: Record the reason'; end if;
 update public.memberships set status=new_status where org_id=o and user_id=target;
 if not found then raise exception 'NOT_FOUND'; end if;
 insert into public.audit_log(org_id,actor_id,action,object_id,outcome) values(o,auth.uid(),'membership.'||new_status,target,'accepted');
 return jsonb_build_object('user_id',target,'status',new_status);
end $$;

-- Members see fellow members' display names (not contact details); admins see the full membership list.
create policy member_profiles on public.profiles for select to authenticated using(exists(
 select 1 from public.memberships a join public.memberships b on a.org_id=b.org_id
 where a.user_id=(select auth.uid()) and a.status='active' and b.user_id=profiles.id));

revoke all on function public.set_capability(uuid,uuid,text,boolean,text),public.set_membership_status(uuid,uuid,text,text) from public,anon;
grant execute on function public.set_capability(uuid,uuid,text,boolean,text),public.set_membership_status(uuid,uuid,text,text) to authenticated;
