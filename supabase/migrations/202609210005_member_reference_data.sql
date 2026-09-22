-- Protocol instructions and instrument identities are needed by assigned monitors; neither is private case evidence.
create policy member_protocol_read on public.protocol_versions for select to authenticated using(private.is_member(org_id));
create policy member_instrument_read on public.instruments for select to authenticated using(private.is_member(org_id));
