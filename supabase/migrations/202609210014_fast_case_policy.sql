-- Same visibility rules as private.can_case, expressed set-wise so PostgreSQL evaluates membership once per query
-- instead of calling security-definer functions for every row (10k-case directories, J03).
create function private.review_orgs() returns setof uuid language sql stable security definer set search_path='' as $$
 select m.org_id from public.memberships m join public.member_capabilities p on p.membership_id=m.id and p.org_id=m.org_id
 where m.user_id=(select auth.uid()) and m.status='active' and p.capability in ('coordinate','expert','evidence_view')
   and (p.expires_at is null or p.expires_at>now());
$$;
create function private.member_orgs() returns setof uuid language sql stable security definer set search_path='' as $$
 select m.org_id from public.memberships m where m.user_id=(select auth.uid()) and m.status='active';
$$;
revoke all on function private.review_orgs(),private.member_orgs() from public,anon;
grant execute on function private.review_orgs(),private.member_orgs() to authenticated;

drop policy case_read on public.cases;
create policy case_read on public.cases for select to authenticated using(
 org_id in (select private.review_orgs())
 or (org_id in (select private.member_orgs()) and (created_by=(select auth.uid())
     or exists(select 1 from public.tasks t where t.org_id=cases.org_id and t.case_id=cases.id and t.assignee_id=(select auth.uid())))));
