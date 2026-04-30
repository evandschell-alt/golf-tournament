-- ============================================================
-- Add permissive RLS policies for people and tournament_players
--
-- HOW TO RUN: Paste this entire file into the Supabase SQL
-- Editor and click Run.
--
-- Why: The 001 migration created `people` and `tournament_players`
-- without RLS policies. Supabase's default-deny means inserts from
-- the anon key were rejected. This adds policies matching the
-- permissive style used on the other tournament tables.
-- ============================================================

alter table people enable row level security;
alter table tournament_players enable row level security;

drop policy if exists "Allow all on people" on people;
create policy "Allow all on people"
  on people for all
  using (true)
  with check (true);

drop policy if exists "Allow all on tournament_players" on tournament_players;
create policy "Allow all on tournament_players"
  on tournament_players for all
  using (true)
  with check (true);
