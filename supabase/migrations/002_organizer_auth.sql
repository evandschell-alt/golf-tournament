-- ============================================================
-- Phase 2: Organizer Auth
--
-- HOW TO RUN: Paste this entire file into the Supabase SQL
-- Editor and click Run.
--
-- AFTER running this, set yourself as organizer:
--   update people
--   set is_organizer = true, email = 'your@gmail.com'
--   where display_name = 'Your Name';
-- ============================================================


-- ── Step 1: Add is_organizer flag to people ──────────────────

alter table people
  add column if not exists is_organizer boolean not null default false;


-- ── Step 2: Security-definer helper function ─────────────────
-- Using security definer means this function runs with elevated
-- privileges and can query the people table even when RLS is
-- enabled — avoiding any circular policy issues.

create or replace function is_organizer()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from people
    where email = auth.email()
      and is_organizer = true
      and email is not null
  );
$$;


-- ── Step 3: Enable RLS on all tables ─────────────────────────

alter table tournaments       enable row level security;
alter table courses           enable row level security;
alter table holes             enable row level security;
alter table teams             enable row level security;
alter table tournament_players enable row level security;
alter table people            enable row level security;
alter table round_settings    enable row level security;
alter table r2_pairings       enable row level security;
alter table scores            enable row level security;


-- ── Step 4: Public read on every table ───────────────────────
-- Spectators (no login) can view the leaderboard, scorecard,
-- player lists — everything. They just can't write.

create policy "public read" on tournaments        for select using (true);
create policy "public read" on courses            for select using (true);
create policy "public read" on holes              for select using (true);
create policy "public read" on teams              for select using (true);
create policy "public read" on tournament_players for select using (true);
create policy "public read" on people             for select using (true);
create policy "public read" on round_settings     for select using (true);
create policy "public read" on r2_pairings        for select using (true);
create policy "public read" on scores             for select using (true);


-- ── Step 5: Organizer write on admin tables ───────────────────
-- Only the organizer can create/edit/delete tournaments, teams,
-- players, courses, pairings, etc.

create policy "organizer write" on tournaments
  for all using (is_organizer()) with check (is_organizer());

create policy "organizer write" on courses
  for all using (is_organizer()) with check (is_organizer());

create policy "organizer write" on holes
  for all using (is_organizer()) with check (is_organizer());

create policy "organizer write" on teams
  for all using (is_organizer()) with check (is_organizer());

create policy "organizer write" on tournament_players
  for all using (is_organizer()) with check (is_organizer());

create policy "organizer write" on people
  for all using (is_organizer()) with check (is_organizer());

create policy "organizer write" on round_settings
  for all using (is_organizer()) with check (is_organizer());

create policy "organizer write" on r2_pairings
  for all using (is_organizer()) with check (is_organizer());


-- ── Step 6: Scores — open writes for now (Phase 3 locks this) ─
-- Anyone can enter scores until captain codes are wired up.

create policy "public write scores"
  on scores for all
  using (true)
  with check (true);
