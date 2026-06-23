-- ICCOTX CareFlow — Live Floor Board schema
-- Safe to re-run.

create extension if not exists "pgcrypto";

create table if not exists public.cases (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  protocol_key  text not null,
  protocol_title text,
  room          text,
  acuity        int,
  arrived_at    timestamptz not null default now(),
  ecg_at        timestamptz,
  provider_at   timestamptz,
  dispo         text,          -- discharge | admit | transfer | lwbs
  dispo_at      timestamptz,
  closed        boolean not null default false
);

create index if not exists cases_arrived_idx on public.cases (arrived_at desc);

alter table public.cases enable row level security;

-- DEMO policy: anonymous full access (fake/demo data only).
-- Replace with authenticated/role-scoped policies before storing anything real.
drop policy if exists "demo_all" on public.cases;
create policy "demo_all" on public.cases
  for all to anon, authenticated
  using (true) with check (true);

-- Enable realtime for cross-device live updates.
do $$
begin
  alter publication supabase_realtime add table public.cases;
exception when duplicate_object then null;
end $$;
