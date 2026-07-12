-- Add columns needed by the Close SuperDay flow.
-- Run this in the Supabase SQL Editor.

alter table tournaments
  add column if not exists is_locked         boolean     not null default false,
  add column if not exists winner_team_name  text,
  add column if not exists winner_points     numeric,
  add column if not exists winner_photo_url  text;
