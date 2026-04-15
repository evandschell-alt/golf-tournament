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
  winner: { playerId: string; teamId: string } | null  // null = carry over
  skinsWon: number  // how many skins this hole was worth (includes carry-overs)
  carryOver: number // skins carrying to next hole (0 if someone won)
}

type SkinsSummary = {
  holeResults: SkinHoleResult[]
  teamSkins: { [teamId: string]: number }  // total skins per team
  playerSkins: { [playerId: string]: number }  // total skins per player
  currentCarryOver: number  // skins currently building up (for live tracker)
}

/**
 * Round 2 Skins: Calculate skins results for a foursome across all holes.
 *
 * Rules:
 * - Each hole is worth 1 skin
 * - Lowest score wins outright → takes all accumulated skins
 * - Tie for lowest → skin carries over to next hole
 * - After hole 18: remaining carry-over skins split evenly among tied players (half-point)
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

    // Find the lowest score
    const lowestScore = Math.min(...hole.players.map((p) => p.strokes))
    const playersWithLowest = hole.players.filter((p) => p.strokes === lowestScore)

    const isLastHole = i === holesData.length - 1 && hole.holeNumber === 18

    if (playersWithLowest.length === 1) {
      // Outright winner — takes all skins
      const winner = playersWithLowest[0]
      playerSkins[winner.playerId] += skinsAtStake
      teamSkins[winner.teamId] += skinsAtStake

      holeResults.push({
        holeNumber: hole.holeNumber,
        winner: { playerId: winner.playerId, teamId: winner.teamId },
        skinsWon: skinsAtStake,
        carryOver: 0,
      })
      carryOver = 0
    } else if (isLastHole) {
      // Tie on hole 18 — split remaining skins (half-point rule)
      const splitAmount = skinsAtStake / playersWithLowest.length
      playersWithLowest.forEach((p) => {
        playerSkins[p.playerId] += splitAmount
        teamSkins[p.teamId] += splitAmount
      })

      holeResults.push({
        holeNumber: hole.holeNumber,
        winner: null, // split, no outright winner
        skinsWon: skinsAtStake,
        carryOver: 0,
      })
      carryOver = 0
    } else {
      // Tie — carry over
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
