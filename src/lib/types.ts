// These types describe the shape of our database tables.
// Think of them as blueprints — they tell the code what fields
// each record has and what type of data each field holds.

export type Course = {
  id: string
  name: string
  created_at: string
}

export type Hole = {
  id: string
  course_id: string
  hole_number: number
  par: number
}

export type Tournament = {
  id: string
  name: string
  year: number
  date: string | null
  course_id: string | null
  use_handicaps: boolean
  is_locked: boolean
  current_round: number
  created_at: string
}

export type Team = {
  id: string
  tournament_id: string
  name: string
  color: string | null
  sort_order: number
  created_at: string
}

// A real-world person who has ever participated in a SuperDay.
// Exists once, forever, across all tournaments.
export type Person = {
  id: string
  display_name: string
  email: string | null
  created_at: string
}

// A person's participation in one specific tournament.
// Captures year-specific data like handicap and captain status.
export type TournamentPlayer = {
  id: string
  person_id: string
  tournament_id: string
  team_id: string
  handicap: number | null
  is_captain: boolean
  captain_code: string | null
  sort_order: number
  created_at: string
  people?: Person
}

export type RoundSetting = {
  id: string
  tournament_id: string
  round_number: number
  format: 'best_ball_stableford' | 'skins' | 'scramble_stableford'
  tee_box: 'white' | 'blue' | 'red'
}

export type R2Pairing = {
  id: string
  tournament_id: string
  group_number: number
  player_id: string  // references tournament_players.id
}

export type Score = {
  id: string
  tournament_id: string
  round_number: number
  hole_number: number
  player_id: string | null  // references tournament_players.id
  team_id: string
  strokes: number
  moneyball_used: boolean
  moneyball_lost: boolean
  created_at: string
  updated_at: string
}
