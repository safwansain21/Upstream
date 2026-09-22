-- Delivery: transport receipt and human acknowledgment are separate facts (F07).
alter table public.deliveries add column acknowledged_at timestamptz, add column acknowledged_by text,
 add column created_at timestamptz not null default now(), add column created_by uuid references auth.users(id);
alter table public.share_grants add column recipient_id uuid, add column created_at timestamptz not null default now();
alter table public.evidence_packages add column case_id uuid;
create index evidence_packages_case on public.evidence_packages(org_id,case_id,created_at desc);
-- Packages are immutable (trigger from foundation); a superseding package links its predecessor.
-- Detached JWS signatures are stored as plain text alongside the package artifacts.
update storage.buckets set allowed_mime_types=array_append(allowed_mime_types,'text/plain') where id='evidence-private' and not 'text/plain'=any(allowed_mime_types);
