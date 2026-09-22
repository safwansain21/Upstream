-- Administrators manage recipients (delivery configuration), without gaining access to case evidence.
create policy admin_recipients on public.recipients for select to authenticated using(private.has_capability(org_id,'admin'));
