-- G10: signed webhook delivery. Secrets and outgoing payloads are worker-only: RLS on, no policies.
create table public.recipient_secrets (
 recipient_id uuid primary key references public.recipients(id), org_id uuid not null references public.organizations(id),
 secret text not null
);
alter table public.recipient_secrets enable row level security;

-- One row per logical delivery; the payload bytes are fixed when the expert sends, so every retry sends the same bytes.
create table public.webhook_outbox (
 delivery_id uuid primary key references public.deliveries(id), org_id uuid not null references public.organizations(id),
 payload bytea not null, next_attempt_at timestamptz not null default now()
);
alter table public.webhook_outbox enable row level security;
create index webhook_outbox_due on public.webhook_outbox(next_attempt_at);
