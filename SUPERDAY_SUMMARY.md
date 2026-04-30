# SuperDay — What We've Built

A mobile-first web app for running and scoring your annual golf tournament. Built together from scratch, April 2026.

---

## Live Links

| Thing | URL |
|---|---|
| Live app | https://golf-tournament-seven.vercel.app |
| GitHub repo | https://github.com/evandschell-alt/golf-tournament |
| Supabase (database) | https://upodrprbkhayvpfmvplx.supabase.co |

Auto-deploys to Vercel every time a change is pushed to GitHub.

---

## Tech Stack

- **Next.js** — the web framework (React-based)
- **Supabase** — database + file storage + real-time updates
- **Vercel** — hosting and deployment
- **GitHub** — code storage and version control

---

## What the App Does

### Home Page
Two sections: **Open** (active tournaments) and **Past SuperDays** (archived). Past SuperDays cards show the winning team name, points, and a winner photo. From the home page you can create a new SuperDay or jump into an active one.

### Create a New SuperDay — Setup Wizard
A 3-step flow:
1. **Tournament info** — name, year, date
2. **Course setup** — course name, par for all 18 holes, optional yardages (white/blue/red tees)
3. **Teams & players** — 2–4 teams, 4 players each, optional handicaps

### Score Entry
The main screen during play. Supports all three rounds:
- **Round 1 (Best Ball Stableford)** — enter all 4 player scores per hole; tracks moneyball usage
- **Round 2 (Skins)** — foursome-based entry for paired players; skins tracked hole by hole
- **Round 3 (Scramble)** — one team score per hole; tracks mulligans per player

Scores auto-save as you type.

### Leaderboard
Real-time team standings. Shows total points and a per-round breakdown (R1 / R2 / R3). Updates live as scores are entered — no refresh needed. Highlights the leader in gold.

### Scorecard
A full hole-by-hole view of completed scores. Expandable round cards, front/back 9 split, swipe-friendly on mobile.

### R2 Pairings
Set up the Round 2 foursomes before play starts. Assign 2 players from each team to each group. The app prevents duplicate assignments.

### Settings
Edit tournament name, date, course name, tee boxes, team names, and player rosters after the fact.

### Close SuperDay
When the tournament is over: record the winning team name, point total, and upload a winner photo. The tournament moves to the "Past SuperDays" archive on the home page. Winner photos from iPhones (HEIC format) are automatically converted to JPEG.

---

## Scoring Rules (as built)

### Round 1 — Best Ball Stableford (White Tees)
Each player scores individually. The best score on the hole counts for the team. Stableford points:

| Score | Points |
|---|---|
| Double Eagle (−3) | 8 |
| Eagle (−2) | 4 |
| Birdie (−1) | 2 |
| Par | 1 |
| Bogey or worse | 0 |

**Moneyball:** Each player gets one moneyball per round — use it to subtract 1 stroke from that hole's score. If lost, it's gone.

### Round 2 — Skins (Blue Tees)
Teams split into foursomes. 1 skin per hole. Lowest score in the foursome wins the skin outright — ties carry the skin over to the next hole. Unclaimed skins at the end are split 50/50 (half-points allowed).

### Round 3 — Adjusted Stableford Scramble (Red Tees)
All players hit, best shot is selected, repeat. One team score per hole. Adjusted Stableford points:

| Score | Points |
|---|---|
| Double Eagle (−3) | 8 |
| Eagle (−2) | 4 |
| Birdie (−1) | 1 |
| Par | 0 |
| Bogey or worse | −2 |

**Mulligans:** Each player gets one per round to replay any shot.

---

## Key Design Decisions

- **No login required** — anyone with the link can use the app
- **Rosters are fixed** — same 4 players per team across all 3 rounds
- **R2 pairings are manual** — team captains decide, organizer enters them
- **Leaderboard = team totals only** — individual detail lives on the scorecard
- **No putt-off** — tied skins split evenly
- **Half-points supported** — so odd numbers of skins can be split fairly

---

## Database Tables

| Table | What it stores |
|---|---|
| `tournaments` | One row per SuperDay — name, year, date, winner info, locked status |
| `courses` | Course name |
| `holes` | Par and yardages for all 18 holes per course |
| `teams` | Team names, linked to a tournament |
| `players` | Player names and handicaps, linked to a team |
| `round_settings` | Tee box and format per round |
| `r2_pairings` | Which players are in which Round 2 foursome |
| `scores` | Every hole score for every player, all rounds |

---

## What's Not Built Yet

- Branding / visual design polish (deferred — flagged as a future session)
- Handicap scoring (database field exists, toggle is in setup, but scoring logic not wired up)
- Multi-device conflict resolution (two people entering the same hole at the same time)
- Admin protection (no password on the close/settings flows)
