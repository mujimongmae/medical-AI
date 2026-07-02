-- ============================================================================
-- emergency_events — optional Supabase Realtime transport for collapse events.
--
-- This table is ONLY used when the app is configured with
-- NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY. Without it, the app
-- falls back to BroadcastChannel (same-browser, no backend) and this file is
-- irrelevant.
--
-- DEMO SCOPE ONLY: policies below grant the anon role INSERT + SELECT so two
-- devices can exchange candidate events with no auth. This is intentionally
-- permissive for a hackathon demo. DO NOT ship as-is to real users:
--   - No PHI/PII belongs in `payload` (synthetic/demo data only).
--   - Lock down with real auth + per-user RLS before any production use.
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.emergency_events (
  -- Surrogate PK (independent of the app-level event_id).
  id          uuid        primary key default gen_random_uuid(),
  -- App-level EmergencyEvent.eventId (dedupe key across transports).
  event_id    text        not null,
  -- Per-tab sender id; receivers drop rows they themselves inserted.
  sender_id   text        not null,
  -- The full EmergencyEvent JSON (matches lib/types.ts EmergencyEvent).
  payload     jsonb       not null,
  created_at  timestamptz not null default now()
);

-- Fast lookups / ordering for a receiver reading recent candidates.
create index if not exists emergency_events_created_at_idx
  on public.emergency_events (created_at desc);

create index if not exists emergency_events_event_id_idx
  on public.emergency_events (event_id);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast INSERTs to subscribed clients.
-- (Safe to run repeatedly; ignore "already member" errors.)
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.emergency_events;
  exception
    when duplicate_object then null;  -- already added
    when undefined_object then null;  -- publication not present in this project
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security. RLS ON, with permissive DEMO policies for anon.
-- ---------------------------------------------------------------------------
alter table public.emergency_events enable row level security;

-- Anyone (anon) may insert a candidate event (homecam emitter).
drop policy if exists "demo anon insert" on public.emergency_events;
create policy "demo anon insert"
  on public.emergency_events
  for insert
  to anon
  with check (true);

-- Anyone (anon) may read candidate events (receiver app).
drop policy if exists "demo anon select" on public.emergency_events;
create policy "demo anon select"
  on public.emergency_events
  for select
  to anon
  using (true);
