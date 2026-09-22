-- Local mapping: editable proposed drafts, immutable published versions (C01-C07).

alter table public.network_versions add column published_at timestamptz,
 add column supersedes_id uuid, add column domain_note text not null default '',
 add column import_warnings jsonb not null default '[]';
alter table public.network_edges add column culvert boolean not null default false;
-- A station belongs to one network version; the same code reappears in later versions.
alter table public.stations drop constraint stations_case_id_code_key;
alter table public.stations add constraint stations_network_code unique(network_id, code);
-- Only one open draft per case keeps review diffs unambiguous.
create unique index network_one_draft on public.network_versions(case_id) where status='proposed';

-- Published (reviewed/rejected) versions and their geometry are immutable; drafts may be edited until publication.
create function private.network_frozen() returns trigger language plpgsql set search_path='' as $$
declare st text;
begin
 if tg_table_name='network_versions' then
  if old.status<>'proposed' then raise exception 'Immutable network version: create a new draft'; end if;
  return case when tg_op='DELETE' then old else new end;
 end if;
 select status into st from public.network_versions where id=coalesce(old.network_id,new.network_id);
 if st is distinct from 'proposed' then raise exception 'Immutable network version: create a new draft'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger frozen before update or delete on public.network_versions for each row execute function private.network_frozen();
create trigger frozen before insert or update or delete on public.network_nodes for each row execute function private.network_frozen();
create trigger frozen before insert or update or delete on public.network_edges for each row execute function private.network_frozen();

create function public.publish_network(o uuid,nid uuid,reason text,evidence text[],boundary text,mixing boolean,domain_note text)
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
 select network_id into prior from public.cases where org_id=o and id=n.case_id for update;
 update public.network_versions set status='reviewed',reviewed_by=auth.uid(),review_reason=reason,evidence_refs=evidence,
  boundary_treatment=boundary,mixing_reviewed=mixing,domain_note=publish_network.domain_note,published_at=now(),supersedes_id=prior
  where id=nid returning * into n;
 update public.cases set network_id=nid,updated_at=now(),version=version+1 where id=n.case_id;
 perform private.record_event(o,n.case_id,'network.published',nid,n.version,jsonb_build_object('supersedes',prior,'evidence',evidence));
 return jsonb_build_object('id',nid,'version',n.version,'status',n.status,'supersedes',prior);
end $$;
revoke all on function public.publish_network(uuid,uuid,text,text[],text,boolean,text) from public,anon;
grant execute on function public.publish_network(uuid,uuid,text,text[],text,boolean,text) to authenticated;
