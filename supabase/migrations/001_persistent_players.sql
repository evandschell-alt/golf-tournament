-- ============================================================
-- Phase 1: Persistent Players
--
-- HOW TO RUN: Paste this entire file into the Supabase SQL
-- Editor and click Run. Do this AFTER wiping all tournament
-- data (tournaments, teams, scores, etc.).
-- ============================================================

-- Step 1: Drop FK constraints that currently reference the old players table
alter table scores
  drop constraint if exists scores_player_id_fkey;

alter table r2_pairings
  drop constraint if exists r2_pairings_player_id_fkey;

-- Step 2: Drop old players table (data must be wiped first)
drop table if exists players;

-- Step 3: Create people table
-- One row per real-world person, reused across all tournaments
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text unique,
  created_at timestamptz not null default now()
);

create index if not exists people_display_name_idx on people (display_name);

-- Step 4: Create tournament_players table
-- One row per person per tournament — captures year-specific data
create table if not exists tournament_players (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete restrict,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  handicap numeric,
  is_captain boolean not null default false,
  captain_code text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (person_id, tournament_id)
);

create index if not exists tournament_players_tournament_idx on tournament_players (tournament_id);
create index if not exists tournament_players_team_idx on tournament_players (team_id);
create index if not exists tournament_players_person_idx on tournament_players (person_id);

-- Step 5: Re-add FK constraints on scores and r2_pairings,
-- now pointing to tournament_players instead of players
alter table scores
  add constraint scores_tournament_player_id_fkey
    foreign key (player_id) references tournament_players(id) on delete cascade;

alter table r2_pairings
  add constraint r2_pairings_tournament_player_id_fkey
    foreign key (player_id) references tournament_players(id) on delete cascade;
