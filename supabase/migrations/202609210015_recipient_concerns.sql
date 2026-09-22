-- F11: administrators record which context concerns a recipient handles (public access, animal access, habitat).
-- Context layers can then suggest recipients; they never enter the engine snapshot.
alter table public.recipients add column concerns text[] not null default '{}'
 check (concerns <@ array['public_access','animal_access','habitat']::text[]);
