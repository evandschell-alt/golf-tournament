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
