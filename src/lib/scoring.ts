// ============================================
// SCORING LOGIC
// All the math for converting strokes to points.
// The UI calls these functions — they never touch the database.
// ============================================

/**
 * Round 1: Stableford points based on score relative to par.
 * Bogey or worse = 0, Par = 1, Birdie = 2, Eagle = 4, Albatross = 8
 */
export function stablefordPoints(strokes: number, par: number): number {
  const diff = strokes - par

  if (diff >= 1) return 0      // Bogey or worse
  if (diff === 0) return 1     // Par
  if (diff === -1) return 2    // Birdie
  if (diff === -2) return 4    // Eagle
  if (diff <= -3) return 8     // Albatross (Double Eagle)

  return 0
}

/**
 * Round 3: Adjusted Stableford points.
 * Bogey or worse = -2, Par = 0, Birdie = 1, Eagle = 4, Albatross = 8
 */
export function adjustedStablefordPoints(strokes: number, par: number): number {
  const diff = strokes - par

  if (diff >= 1) return -2     // Bogey or worse
  if (diff === 0) return 0     // Par
  if (diff === -1) return 1    // Birdie
  if (diff === -2) return 4    // Eagle
  if (diff <= -3) return 8     // Albatross (Double Eagle)

  return -2
}

/**
 * Round 1 Best Ball: Given 4 player scores on a hole,
 * find the best (lowest) score after applying moneyball adjustment,
 * then convert to Stableford points.
 *
 * Each player entry has: strokes, moneyball_used, moneyball_lost
 * If moneyball_used and NOT moneyball_lost: subtract 1 stroke
 */
export function round1HolePoints(
  players: { strokes: number; moneyball_used: boolean; moneyball_lost: boolean }[],
  par: number
): { points: number; bestScore: number; bestPlayerIndex: number } {
  let bestScore = Infinity
  let bestPlayerIndex = 0

  players.forEach((p, i) => {
    let adjusted = p.strokes
    if (p.moneyball_used && !p.moneyball_lost) {
      adjusted -= 1
    }
    if (adjusted < bestScore) {
      bestScore = adjusted
      bestPlayerIndex = i
    }
  })

  return {
    points: stablefordPoints(bestScore, par),
    bestScore,
    bestPlayerIndex,
  }
}

/**
 * Calculate total Round 1 points for a team across all holes.
 */
export function round1TotalPoints(
  holes: {
    par: number
    players: { strokes: number; moneyball_used: boolean; moneyball_lost: boolean }[]
  }[]
): number {
  return holes.reduce((total, hole) => {
    // Skip holes where not all players have entered scores
    const allEntered = hole.players.every((p) => p.strokes > 0)
    if (!allEntered) return total

    return total + round1HolePoints(hole.players, hole.par).points
  }, 0)
}

/**
 * Calculate total Round 3 (scramble) points for a team.
 */
export function round3TotalPoints(
  holes: { par: number; strokes: number }[]
): number {
  return holes.reduce((total, hole) => {
    if (hole.strokes <= 0) return total
    return total + adjustedStablefordPoints(hole.strokes, hole.par)
  }, 0)
}

// ============================================
// ROUND 2: SKINS
// ============================================

type SkinPlayerScore = {
  playerId: string
  teamId: string
  strokes: number
}

type SkinHoleResult = {
  holeNumber: number
  // winner: the team that won the skin and which of their players had the team's best ball.
  // null = carry over (teams tied on best ball).
  winner: { teamId: string; playerIds: string[] } | null
  skinsWon: number  // how many skins this hole was worth (includes carry-overs)
  carryOver: number // skins carrying to next hole (0 if a team won)
}

type SkinsSummary = {
  holeResults: SkinHoleResult[]
  teamSkins: { [teamId: string]: number }  // total skins per team
  playerSkins: { [playerId: string]: number }  // total skins per player
  currentCarryOver: number  // skins currently building up (for live tracker)
}

/**
 * Round 2 Skins (Best Ball): Calculate skins results for a foursome across all holes.
 *
 * Rules:
 * - Each hole is worth 1 skin
 * - Each team's hole score = its best (lowest) player score on that hole
 * - Team with the lowest best-ball wins outright → takes all accumulated skins
 * - Teams tied on best-ball → skin carries over to next hole
 * - After hole 18: remaining carry-over skins split evenly among tied teams (half-point)
 *
 * Per-player credit:
 * - If one player on the winning team had the team's best ball, they get full credit
 * - If both teammates tied on the team's best ball, they split 50/50
 *
 * @param holesData - Array of { holeNumber, players: [...] } for each completed hole, in order
 * @returns SkinsSummary with per-hole results, team totals, and carry-over tracker
 */
export function calculateSkins(
  holesData: { holeNumber: number; players: SkinPlayerScore[] }[]
): SkinsSummary {
  const holeResults: SkinHoleResult[] = []
  const teamSkins: { [teamId: string]: number } = {}
  const playerSkins: { [playerId: string]: number } = {}
  let carryOver = 0

  // Initialize all players/teams to 0
  holesData.forEach((h) => {
    h.players.forEach((p) => {
      if (!(p.teamId in teamSkins)) teamSkins[p.teamId] = 0
      if (!(p.playerId in playerSkins)) playerSkins[p.playerId] = 0
    })
  })

  for (let i = 0; i < holesData.length; i++) {
    const hole = holesData[i]
    const skinsAtStake = 1 + carryOver

    // Compute each team's best ball (lowest player score) on this hole,
    // and track which players on that team tied for that best score.
    const teamBest: { [teamId: string]: { score: number; playerIds: string[] } } = {}
    hole.players.forEach((p) => {
      const existing = teamBest[p.teamId]
      if (!existing || p.strokes < existing.score) {
        teamBest[p.teamId] = { score: p.strokes, playerIds: [p.playerId] }
      } else if (p.strokes === existing.score) {
        existing.playerIds.push(p.playerId)
      }
    })

    // Find the lowest team best-ball and which team(s) had it.
    const teamIds = Object.keys(teamBest)
    const lowestTeamScore = Math.min(...teamIds.map((id) => teamBest[id].score))
    const winningTeamIds = teamIds.filter((id) => teamBest[id].score === lowestTeamScore)

    const isLastHole = i === holesData.length - 1 && hole.holeNumber === 18

    if (winningTeamIds.length === 1) {
      // Outright team winner — takes all skins
      const winnerTeamId = winningTeamIds[0]
      const winnerPlayerIds = teamBest[winnerTeamId].playerIds

      teamSkins[winnerTeamId] += skinsAtStake
      const perPlayer = skinsAtStake / winnerPlayerIds.length
      winnerPlayerIds.forEach((pid) => {
        playerSkins[pid] += perPlayer
      })

      holeResults.push({
        holeNumber: hole.holeNumber,
        winner: { teamId: winnerTeamId, playerIds: winnerPlayerIds },
        skinsWon: skinsAtStake,
        carryOver: 0,
      })
      carryOver = 0
    } else if (isLastHole) {
      // Teams tied on hole 18 — split remaining skins across tied teams (half-point).
      // Within each winning team, split that team's share among its best-ball players.
      const perTeam = skinsAtStake / winningTeamIds.length
      winningTeamIds.forEach((tid) => {
        teamSkins[tid] += perTeam
        const pids = teamBest[tid].playerIds
        const perPlayer = perTeam / pids.length
        pids.forEach((pid) => {
          playerSkins[pid] += perPlayer
        })
      })

      holeResults.push({
        holeNumber: hole.holeNumber,
        winner: null, // split, no outright team winner
        skinsWon: skinsAtStake,
        carryOver: 0,
      })
      carryOver = 0
    } else {
      // Teams tied — carry over
      holeResults.push({
        holeNumber: hole.holeNumber,
        winner: null,
        skinsWon: 0,
        carryOver: skinsAtStake,
      })
      carryOver = skinsAtStake
    }
  }

  return {
    holeResults,
    teamSkins,
    playerSkins,
    currentCarryOver: carryOver,
  }
}

/**
 * Format a score relative to par for display.
 * e.g., -1 = "Birdie", 0 = "Par", +1 = "Bogey"
 */
export function scoreLabel(strokes: number, par: number): string {
  const diff = strokes - par

  if (diff <= -3) return "Albatross"
  if (diff === -2) return "Eagle"
  if (diff === -1) return "Birdie"
  if (diff === 0) return "Par"
  if (diff === 1) return "Bogey"
  if (diff === 2) return "Double Bogey"
  return `+${diff}`
}
