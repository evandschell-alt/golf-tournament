"use client"

import { useState, useEffect, use } from "react"
import { supabase } from "@/lib/supabase"
import { round1HolePoints, stablefordPoints, scoreLabel } from "@/lib/scoring"
import Link from "next/link"

type Player = { id: string; name: string; sort_order: number }
type Team = { id: string; name: string; players: Player[] }
type Hole = { hole_number: number; par: number; yardage_white: number | null; yardage_blue: number | null; yardage_red: number | null }

type HoleScores = {
  [playerId: string]: {
    strokes: number
    moneyball_used: boolean
    moneyball_lost: boolean
  }
}

export default function ScoreEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params)

  // State
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [holes, setHoles] = useState<Hole[]>([])
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<{ [holeNumber: number]: HoleScores }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tournamentName, setTournamentName] = useState("")
  const [roundNumber] = useState(1) // Phase 3 = Round 1 only

  // Moneyball tracking: which hole was the moneyball used on (if any)
  const [moneyballHole, setMoneyballHole] = useState<number | null>(null)
  const [showScorecard, setShowScorecard] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      // Tournament info
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("name, year, course_id")
        .eq("id", tournamentId)
        .single()

      if (tournament) {
        setTournamentName(`${tournament.name} ${tournament.year}`)

        // Fetch holes
        if (tournament.course_id) {
          const { data: holesData } = await supabase
            .from("holes")
            .select("hole_number, par, yardage_white, yardage_blue, yardage_red")
            .eq("course_id", tournament.course_id)
            .order("hole_number")

          setHoles(holesData || [])
        }
      }

      // Fetch teams and players
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name, sort_order, players(id, name, sort_order)")
        .eq("tournament_id", tournamentId)
        .order("sort_order")

      if (teamsData) {
        const sorted = teamsData.map((t) => ({
          ...t,
          players: (t.players || []).sort(
            (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
          ),
        }))
        setTeams(sorted)
      }

      setLoading(false)
    }

    fetchData()
  }, [tournamentId])

  // Load existing scores when team is selected
  useEffect(() => {
    if (!selectedTeam) return

    const loadScores = async () => {
      const { data: existingScores } = await supabase
        .from("scores")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("round_number", roundNumber)
        .eq("team_id", selectedTeam.id)

      if (existingScores && existingScores.length > 0) {
        const loaded: { [holeNumber: number]: HoleScores } = {}
        let mbHole: number | null = null

        existingScores.forEach((s) => {
          if (!loaded[s.hole_number]) loaded[s.hole_number] = {}
          if (s.player_id) {
            loaded[s.hole_number][s.player_id] = {
              strokes: s.strokes,
              moneyball_used: s.moneyball_used,
              moneyball_lost: s.moneyball_lost,
            }
            if (s.moneyball_used) mbHole = s.hole_number
          }
        })

        setScores(loaded)
        setMoneyballHole(mbHole)
      }
    }

    loadScores()
  }, [selectedTeam, tournamentId, roundNumber])

  // Get the tee yardage for the current round
  function getYardage(hole: Hole): number | null {
    if (roundNumber === 1) return hole.yardage_white
    if (roundNumber === 2) return hole.yardage_blue
    return hole.yardage_red
  }

  // Get or initialize scores for a hole (default to 0 = blank/dash)
  function getHoleScores(holeNumber: number): HoleScores {
    if (scores[holeNumber]) return scores[holeNumber]
    const init: HoleScores = {}
    selectedTeam?.players.forEach((p) => {
      init[p.id] = { strokes: 0, moneyball_used: false, moneyball_lost: false }
    })
    return init
  }

  // Update a player's stroke count
  function setStrokes(holeNumber: number, playerId: string, strokes: number) {
    const holeScores = { ...getHoleScores(holeNumber) }
    holeScores[playerId] = { ...holeScores[playerId], strokes }
    setScores({ ...scores, [holeNumber]: holeScores })
  }

  // Increment/decrement strokes
  // First tap on an untouched score (0) snaps to par, then adjusts from there
  function adjustStrokes(holeNumber: number, playerId: string, delta: number) {
    const current = getHoleScores(holeNumber)[playerId]?.strokes || 0
    if (current === 0) {
      // First interaction — start at par
      const hole = holes.find((h) => h.hole_number === holeNumber)
      const par = hole?.par || 4
      setStrokes(holeNumber, playerId, par)
    } else {
      const newVal = Math.max(1, current + delta)
      setStrokes(holeNumber, playerId, newVal)
    }
  }

  // Toggle moneyball for a player on a hole
  function toggleMoneyball(holeNumber: number, playerId: string) {
    const holeScores = { ...getHoleScores(holeNumber) }
    const playerScore = { ...holeScores[playerId] }

    if (playerScore.moneyball_used) {
      // Turn off moneyball
      playerScore.moneyball_used = false
      playerScore.moneyball_lost = false
      holeScores[playerId] = playerScore
      setScores({ ...scores, [holeNumber]: holeScores })
      setMoneyballHole(null)
    } else {
      // Turn on moneyball — clear it from any other player/hole first
      const updated = { ...scores }

      // Clear any existing moneyball
      if (moneyballHole !== null && updated[moneyballHole]) {
        const oldHoleScores = { ...updated[moneyballHole] }
        Object.keys(oldHoleScores).forEach((pid) => {
          if (oldHoleScores[pid].moneyball_used) {
            oldHoleScores[pid] = { ...oldHoleScores[pid], moneyball_used: false, moneyball_lost: false }
          }
        })
        updated[moneyballHole] = oldHoleScores
      }

      // Set new moneyball
      playerScore.moneyball_used = true
      holeScores[playerId] = playerScore
      updated[holeNumber] = holeScores
      setScores(updated)
      setMoneyballHole(holeNumber)
    }
  }

  // Toggle moneyball lost
  function toggleMoneyballLost(holeNumber: number, playerId: string) {
    const holeScores = { ...getHoleScores(holeNumber) }
    const playerScore = { ...holeScores[playerId] }
    playerScore.moneyball_lost = !playerScore.moneyball_lost
    holeScores[playerId] = playerScore
    setScores({ ...scores, [holeNumber]: holeScores })
  }

  // Save scores for the current hole (untouched players default to par)
  async function saveHoleScores(holeNumber: number) {
    if (!selectedTeam) return
    setSaving(true)

    const hole = holes.find((h) => h.hole_number === holeNumber)
    const par = hole?.par || 4
    const holeScores = getHoleScores(holeNumber)
    const players = selectedTeam.players

    // Fill in par for any untouched players (strokes === 0)
    const filledScores: HoleScores = {}
    players.forEach((p) => {
      const ps = holeScores[p.id]
      filledScores[p.id] = {
        ...ps,
        strokes: ps.strokes === 0 ? par : ps.strokes,
      }
    })

    // Persist into state so the hole shows as completed
    setScores((prev) => ({ ...prev, [holeNumber]: filledScores }))

    for (const player of players) {
      const ps = filledScores[player.id]

      const { error } = await supabase
        .from("scores")
        .upsert(
          {
            tournament_id: tournamentId,
            round_number: roundNumber,
            hole_number: holeNumber,
            player_id: player.id,
            team_id: selectedTeam.id,
            strokes: ps.strokes,
            moneyball_used: ps.moneyball_used,
            moneyball_lost: ps.moneyball_lost,
          },
          {
            onConflict: "tournament_id,round_number,hole_number,player_id",
          }
        )

      if (error) {
        console.error("Save error:", error)
      }
    }

    setSaving(false)
  }

  // Unsave/undo scores for a hole (remove from state + delete from Supabase)
  async function unsaveHoleScores(holeNumber: number) {
    if (!selectedTeam) return

    // Remove from local state so the hole circle turns grey
    setScores((prev) => {
      const next = { ...prev }
      delete next[holeNumber]
      return next
    })

    // Delete from Supabase
    const players = selectedTeam.players
    for (const player of players) {
      await supabase
        .from("scores")
        .delete()
        .eq("tournament_id", tournamentId)
        .eq("round_number", roundNumber)
        .eq("hole_number", holeNumber)
        .eq("player_id", player.id)
    }
  }

  // Calculate running total points
  function getTotalPoints(): number {
    let total = 0
    holes.forEach((hole) => {
      const hs = scores[hole.hole_number]
      if (!hs) return
      const players = selectedTeam?.players || []
      const allEntered = players.every((p) => hs[p.id]?.strokes > 0)
      if (!allEntered) return

      const playerData = players.map((p) => ({
        strokes: hs[p.id].strokes,
        moneyball_used: hs[p.id].moneyball_used,
        moneyball_lost: hs[p.id].moneyball_lost,
      }))

      total += round1HolePoints(playerData, hole.par).points
    })
    return total
  }

  // Count completed holes
  function getCompletedHoles(): number {
    let count = 0
    holes.forEach((hole) => {
      const hs = scores[hole.hole_number]
      if (!hs) return
      const players = selectedTeam?.players || []
      const allEntered = players.every((p) => hs[p.id]?.strokes > 0)
      if (allEntered) count++
    })
    return count
  }

  // Get scorecard data for a hole (returns null if not completed)
  function getScorecardHole(holeNumber: number): { bestScore: number; points: number } | null {
    const hs = scores[holeNumber]
    if (!hs) return null
    const players = selectedTeam?.players || []
    const allEntered = players.every((p) => hs[p.id]?.strokes > 0)
    if (!allEntered) return null

    const playerData = players.map((p) => ({
      strokes: hs[p.id].strokes,
      moneyball_used: hs[p.id].moneyball_used,
      moneyball_lost: hs[p.id].moneyball_lost,
    }))
    const result = round1HolePoints(playerData, holes.find((h) => h.hole_number === holeNumber)!.par)
    return { bestScore: result.bestScore, points: result.points }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading...</p>
      </div>
    )
  }

  // Team selection screen
  if (!selectedTeam) {
    return (
      <div className="flex flex-col flex-1 bg-green-50 px-4 py-6">
        <div className="w-full max-w-md mx-auto">
          <Link href="/" className="text-sm text-green-600 hover:text-green-800 mb-4 inline-block">
            &larr; Back to Home
          </Link>

          <h1 className="text-2xl font-bold text-green-900 mb-1">Enter Scores</h1>
          <p className="text-sm text-green-700 mb-1">{tournamentName} &middot; Round {roundNumber}</p>
          <p className="text-sm text-green-600 mb-6">Select your team to begin entering scores.</p>

          <div className="flex flex-col gap-3">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setSelectedTeam(team)}
                className="rounded-xl bg-white border-2 border-green-200 p-4 text-left hover:border-green-500 transition-colors"
              >
                <h3 className="font-bold text-green-900 text-lg">{team.name}</h3>
                <p className="text-sm text-green-600 mt-1">
                  {team.players.map((p) => p.name).join(", ")}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Score entry screen
  const hole = holes.find((h) => h.hole_number === currentHole)
  if (!hole) return null

  const holeScores = getHoleScores(currentHole)
  const allEntered = selectedTeam.players.every((p) => holeScores[p.id]?.strokes > 0)

  // Calculate points for this hole if all scores entered
  let holePoints: number | null = null
  let bestScore: number | null = null
  if (allEntered) {
    const playerData = selectedTeam.players.map((p) => ({
      strokes: holeScores[p.id].strokes,
      moneyball_used: holeScores[p.id].moneyball_used,
      moneyball_lost: holeScores[p.id].moneyball_lost,
    }))
    const result = round1HolePoints(playerData, hole.par)
    holePoints = result.points
    bestScore = result.bestScore
  }

  const moneyballAvailable = moneyballHole === null || moneyballHole === currentHole

  return (
    <div className="flex flex-col flex-1 bg-green-50">
      {/* Sticky header with team, round, and running total */}
      <div className="sticky top-0 z-10 bg-green-700 text-white px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto flex items-center">
          <div className="flex-1">
            <p className="font-bold text-sm">{selectedTeam.name}</p>
            <p className="text-xs text-green-200">Round {roundNumber} &middot; {roundNumber === 1 ? "Best Ball" : roundNumber === 2 ? "Skins" : "Scramble"}</p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowScorecard(!showScorecard)}
              className="text-xs bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-lg font-semibold transition-colors"
            >
              {showScorecard ? "Scores" : "Card"}
            </button>
            <Link
              href={`/tournament/${tournamentId}/leaderboard`}
              className="text-xs bg-yellow-400 text-yellow-900 hover:bg-yellow-300 px-3 py-1.5 rounded-lg font-semibold transition-colors"
            >
              Board
            </Link>
          </div>
          <p className="flex-1 text-right text-sm font-bold">RD PTS: {getTotalPoints()}</p>
        </div>
      </div>

      {/* Scorecard view */}
      {showScorecard && (
        <div className="flex-1 px-4 py-4">
          <div className="max-w-md mx-auto">
            {/* Front 9 */}
            <div className="rounded-xl bg-white border border-green-200 overflow-hidden mb-4">
              <div className="bg-green-100 px-3 py-2">
                <h3 className="font-bold text-green-900 text-sm">Front 9</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-green-100">
                    <th className="text-left px-3 py-1.5 text-xs text-green-600 font-semibold">Hole</th>
                    {holes.filter((h) => h.hole_number <= 9).map((h) => (
                      <th key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 font-semibold text-center w-[2rem]">
                        {h.hole_number}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">Tot</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-green-50">
                    <td className="px-3 py-1.5 text-xs text-green-600">Par</td>
                    {holes.filter((h) => h.hole_number <= 9).map((h) => (
                      <td key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 text-center">{h.par}</td>
                    ))}
                    <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                      {holes.filter((h) => h.hole_number <= 9).reduce((sum, h) => sum + h.par, 0)}
                    </td>
                  </tr>
                  <tr className="border-b border-green-50">
                    <td className="px-3 py-1.5 text-xs text-green-600">Score</td>
                    {holes.filter((h) => h.hole_number <= 9).map((h) => {
                      const data = getScorecardHole(h.hole_number)
                      return (
                        <td key={h.hole_number} className={`px-1 py-1.5 text-xs text-center font-medium ${
                          data ? (data.bestScore < h.par ? "text-red-600" : data.bestScore > h.par ? "text-blue-600" : "text-green-900") : "text-gray-300"
                        }`}>
                          {data ? data.bestScore : "–"}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                      {holes.filter((h) => h.hole_number <= 9).reduce((sum, h) => {
                        const data = getScorecardHole(h.hole_number)
                        return sum + (data ? data.bestScore : 0)
                      }, 0) || "–"}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-xs text-green-600">Pts</td>
                    {holes.filter((h) => h.hole_number <= 9).map((h) => {
                      const data = getScorecardHole(h.hole_number)
                      return (
                        <td key={h.hole_number} className={`px-1 py-1.5 text-xs text-center font-bold ${
                          data ? (data.points > 0 ? "text-green-700" : "text-gray-400") : "text-gray-300"
                        }`}>
                          {data ? data.points : "–"}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                      {holes.filter((h) => h.hole_number <= 9).reduce((sum, h) => {
                        const data = getScorecardHole(h.hole_number)
                        return sum + (data ? data.points : 0)
                      }, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Back 9 */}
            <div className="rounded-xl bg-white border border-green-200 overflow-hidden mb-4">
              <div className="bg-green-100 px-3 py-2">
                <h3 className="font-bold text-green-900 text-sm">Back 9</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-green-100">
                    <th className="text-left px-3 py-1.5 text-xs text-green-600 font-semibold">Hole</th>
                    {holes.filter((h) => h.hole_number > 9).map((h) => (
                      <th key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 font-semibold text-center w-[2rem]">
                        {h.hole_number}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">Tot</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-green-50">
                    <td className="px-3 py-1.5 text-xs text-green-600">Par</td>
                    {holes.filter((h) => h.hole_number > 9).map((h) => (
                      <td key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 text-center">{h.par}</td>
                    ))}
                    <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                      {holes.filter((h) => h.hole_number > 9).reduce((sum, h) => sum + h.par, 0)}
                    </td>
                  </tr>
                  <tr className="border-b border-green-50">
                    <td className="px-3 py-1.5 text-xs text-green-600">Score</td>
                    {holes.filter((h) => h.hole_number > 9).map((h) => {
                      const data = getScorecardHole(h.hole_number)
                      return (
                        <td key={h.hole_number} className={`px-1 py-1.5 text-xs text-center font-medium ${
                          data ? (data.bestScore < h.par ? "text-red-600" : data.bestScore > h.par ? "text-blue-600" : "text-green-900") : "text-gray-300"
                        }`}>
                          {data ? data.bestScore : "–"}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                      {holes.filter((h) => h.hole_number > 9).reduce((sum, h) => {
                        const data = getScorecardHole(h.hole_number)
                        return sum + (data ? data.bestScore : 0)
                      }, 0) || "–"}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-xs text-green-600">Pts</td>
                    {holes.filter((h) => h.hole_number > 9).map((h) => {
                      const data = getScorecardHole(h.hole_number)
                      return (
                        <td key={h.hole_number} className={`px-1 py-1.5 text-xs text-center font-bold ${
                          data ? (data.points > 0 ? "text-green-700" : "text-gray-400") : "text-gray-300"
                        }`}>
                          {data ? data.points : "–"}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                      {holes.filter((h) => h.hole_number > 9).reduce((sum, h) => {
                        const data = getScorecardHole(h.hole_number)
                        return sum + (data ? data.points : 0)
                      }, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total summary */}
            <div className="rounded-xl bg-green-700 text-white p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Round {roundNumber} Total</p>
                <p className="text-xs text-green-200">{getCompletedHoles()} of 18 holes</p>
              </div>
              <p className="text-3xl font-bold">{getTotalPoints()} pts</p>
            </div>
          </div>
        </div>
      )}

      {/* Hole navigation + score entry (hidden when scorecard is shown) */}
      {!showScorecard && (
      <div className="flex flex-col flex-1">
      <div className="bg-white border-b border-green-200 px-4 py-2 overflow-x-auto">
        <div className="max-w-md mx-auto flex gap-1">
          {holes.map((h) => {
            const hs = scores[h.hole_number]
            const completed = hs && selectedTeam.players.every((p) => hs[p.id]?.strokes > 0)
            return (
              <button
                key={h.hole_number}
                onClick={() => {
                  setCurrentHole(h.hole_number)
                }}
                className={`min-w-[2rem] h-8 rounded-full text-xs font-bold transition-colors ${
                  h.hole_number === currentHole
                    ? "bg-green-700 text-white"
                    : completed
                    ? "bg-green-200 text-green-800"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {h.hole_number}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hole info */}
      <div className="px-4 pt-4 pb-2">
        <div className="max-w-md mx-auto">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-green-900">Hole {currentHole}</h2>
            <div className="flex gap-3 text-sm text-green-600">
              <span>Par {hole.par}</span>
              {getYardage(hole) && <span>{getYardage(hole)} yds</span>}
            </div>
          </div>

          {/* Points result for this hole */}
          {holePoints !== null && bestScore !== null && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-medium ${
              holePoints > 0
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }`}>
              Best ball: {bestScore} ({scoreLabel(bestScore, hole.par)}) &rarr; {holePoints} {holePoints === 1 ? "point" : "points"}
            </div>
          )}
        </div>
      </div>

      {/* Player score inputs */}
      <div className="flex-1 px-4 pb-4">
        <div className="max-w-md mx-auto flex flex-col gap-3">
          {selectedTeam.players.map((player) => {
            const ps = holeScores[player.id] || { strokes: 0, moneyball_used: false, moneyball_lost: false }
            const isBestBall = allEntered && bestScore !== null &&
              (ps.strokes - (ps.moneyball_used && !ps.moneyball_lost ? 1 : 0)) === bestScore

            return (
              <div
                key={player.id}
                className={`rounded-xl bg-white border-2 p-4 ${
                  isBestBall ? "border-green-500" : "border-green-100"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-green-900 text-sm">{player.name}</span>
                  {isBestBall && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      Best Ball
                    </span>
                  )}
                </div>

                {/* Stroke counter */}
                <div className="flex items-center justify-center gap-4 mb-3">
                  <button
                    onClick={() => adjustStrokes(currentHole, player.id, -1)}
                    className="h-12 w-12 rounded-full bg-green-100 text-green-800 text-xl font-bold flex items-center justify-center hover:bg-green-200 transition-colors"
                  >
                    &minus;
                  </button>
                  <span className="text-3xl font-bold text-green-900 w-12 text-center">
                    {ps.strokes || "—"}
                  </span>
                  <button
                    onClick={() => adjustStrokes(currentHole, player.id, 1)}
                    className="h-12 w-12 rounded-full bg-green-100 text-green-800 text-xl font-bold flex items-center justify-center hover:bg-green-200 transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Moneyball toggle */}
                {(moneyballAvailable || ps.moneyball_used) && (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => toggleMoneyball(currentHole, player.id)}
                      className={`w-full rounded-lg py-2 text-xs font-semibold transition-colors ${
                        ps.moneyball_used
                          ? "bg-yellow-400 text-yellow-900"
                          : "bg-gray-100 text-gray-500 hover:bg-yellow-100"
                      }`}
                    >
                      {ps.moneyball_used ? "Moneyball Active" : "Use Moneyball"}
                    </button>

                    {ps.moneyball_used && (
                      <button
                        onClick={() => toggleMoneyballLost(currentHole, player.id)}
                        className={`w-full rounded-lg py-2 text-xs font-semibold transition-colors ${
                          ps.moneyball_lost
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-500 hover:bg-red-50"
                        }`}
                      >
                        {ps.moneyball_lost ? "Moneyball Lost (no bonus)" : "Mark Ball Lost"}
                      </button>
                    )}
                  </div>
                )}

                {/* Score label */}
                {ps.strokes > 0 && (
                  <p className="text-xs text-center text-green-600 mt-2">
                    {scoreLabel(ps.strokes, hole.par)}
                    {ps.moneyball_used && !ps.moneyball_lost && (
                      <span className="text-yellow-600"> (adjusted: {ps.strokes - 1})</span>
                    )}
                  </p>
                )}
              </div>
            )
          })}

          {/* Save & Navigate buttons */}
          <div className="flex gap-3 mt-2 pb-4">
            <button
              onClick={() => {
                if (currentHole > 1) {
                  unsaveHoleScores(currentHole)
                  setCurrentHole(currentHole - 1)
                }
              }}
              disabled={currentHole === 1}
              className="flex-1 rounded-xl border-2 border-green-700 py-3 text-sm font-semibold text-green-700 disabled:opacity-30 transition-colors"
            >
              &larr; Prev
            </button>
            <button
              onClick={() => {
                if (currentHole < 18) {
                  saveHoleScores(currentHole)
                  setCurrentHole(currentHole + 1)
                }
              }}
              disabled={currentHole === 18}
              className="flex-1 rounded-xl bg-green-700 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-30 transition-colors"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>
      </div>
      )}
    </div>
  )
}
