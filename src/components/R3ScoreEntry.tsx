"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { adjustedStablefordPoints, round3TotalPoints, scoreLabel } from "@/lib/scoring"

type Player = { id: string; name: string; sort_order: number }
type Team = { id: string; name: string; players: Player[] }
type Hole = { hole_number: number; par: number; yardage_red: number | null }

type Props = {
  tournamentId: string
  team: Team
}

export default function R3ScoreEntry({ tournamentId, team }: Props) {
  const [holes, setHoles] = useState<Hole[]>([])
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<{ [holeNumber: number]: number }>({}) // just strokes per hole
  const [mulligans, setMulligans] = useState<{ [playerId: string]: boolean }>({}) // which players have used their mulligan
  const [mulliganHoles, setMulliganHoles] = useState<{ [playerId: string]: number }>({}) // which hole each player used it on
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [holeDropdownOpen, setHoleDropdownOpen] = useState(false)

  const MAX_MULLIGANS = 4 // one per player

  useEffect(() => {
    const fetchData = async () => {
      // Fetch holes
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("course_id")
        .eq("id", tournamentId)
        .single()

      if (tournament?.course_id) {
        const { data: holesData } = await supabase
          .from("holes")
          .select("hole_number, par, yardage_red")
          .eq("course_id", tournament.course_id)
          .order("hole_number")
        setHoles(holesData || [])
      }

      setLoading(false)
    }

    fetchData()
  }, [tournamentId])

  // Load existing R3 scores
  useEffect(() => {
    const loadScores = async () => {
      const { data: existingScores } = await supabase
        .from("scores")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("round_number", 3)
        .eq("team_id", team.id)

      if (existingScores && existingScores.length > 0) {
        const loadedScores: { [holeNumber: number]: number } = {}
        const loadedMulligans: { [playerId: string]: boolean } = {}
        const loadedMulliganHoles: { [playerId: string]: number } = {}

        existingScores.forEach((s) => {
          // For scramble, we store one score per hole but use player_id rows for mulligan tracking
          // The team score is stored on the first player's row (or any — they all have the same strokes)
          loadedScores[s.hole_number] = s.strokes

          // Track mulligan usage via moneyball_used field
          if (s.moneyball_used && s.player_id) {
            loadedMulligans[s.player_id] = true
            loadedMulliganHoles[s.player_id] = s.hole_number
          }
        })

        setScores(loadedScores)
        setMulligans(loadedMulligans)
        setMulliganHoles(loadedMulliganHoles)
      }
    }

    loadScores()
  }, [tournamentId, team.id])

  const mulligansUsed = Object.keys(mulligans).filter((k) => mulligans[k]).length
  const mulligansRemaining = MAX_MULLIGANS - mulligansUsed

  function getStrokes(holeNumber: number): number {
    return scores[holeNumber] || 0
  }

  function setHoleStrokes(holeNumber: number, strokes: number) {
    setScores({ ...scores, [holeNumber]: strokes })
  }

  function adjustStrokes(holeNumber: number, delta: number) {
    const current = getStrokes(holeNumber)
    if (current === 0) {
      // First tap — snap to par
      const hole = holes.find((h) => h.hole_number === holeNumber)
      const par = hole?.par || 4
      setHoleStrokes(holeNumber, par)
    } else {
      const newVal = Math.max(1, current + delta)
      setHoleStrokes(holeNumber, newVal)
    }
  }

  // Toggle mulligan for a player on the current hole
  function toggleMulligan(playerId: string) {
    const isCurrentlyUsed = mulligans[playerId]

    if (isCurrentlyUsed) {
      // Remove mulligan
      const updated = { ...mulligans }
      delete updated[playerId]
      setMulligans(updated)

      const updatedHoles = { ...mulliganHoles }
      delete updatedHoles[playerId]
      setMulliganHoles(updatedHoles)
    } else {
      // Use mulligan on this hole
      setMulligans({ ...mulligans, [playerId]: true })
      setMulliganHoles({ ...mulliganHoles, [playerId]: currentHole })
    }
  }

  // Check if a specific player's mulligan was used on this hole
  function isMulliganOnThisHole(playerId: string): boolean {
    return mulligans[playerId] && mulliganHoles[playerId] === currentHole
  }

  // Can this player use a mulligan? (hasn't used one yet, and team still has some left)
  function canUseMulligan(playerId: string): boolean {
    if (mulligans[playerId]) return false // already used theirs
    if (mulligansRemaining <= 0) return false
    return true
  }

  // Save scores for a hole
  async function saveHoleScores(holeNumber: number) {
    setSaving(true)

    const hole = holes.find((h) => h.hole_number === holeNumber)
    const par = hole?.par || 4
    const strokes = getStrokes(holeNumber) === 0 ? par : getStrokes(holeNumber)

    // Update local state
    setScores((prev) => ({ ...prev, [holeNumber]: strokes }))

    // Save one row per player (needed for mulligan tracking)
    for (const player of team.players) {
      const usedMulliganHere = isMulliganOnThisHole(player.id)

      const { error } = await supabase
        .from("scores")
        .upsert(
          {
            tournament_id: tournamentId,
            round_number: 3,
            hole_number: holeNumber,
            player_id: player.id,
            team_id: team.id,
            strokes: strokes,
            moneyball_used: usedMulliganHere,
            moneyball_lost: false,
          },
          { onConflict: "tournament_id,round_number,hole_number,player_id" }
        )
      if (error) console.error("Save error:", error)
    }

    setSaving(false)
  }

  // Unsave a hole
  async function unsaveHoleScores(holeNumber: number) {
    setScores((prev) => {
      const next = { ...prev }
      delete next[holeNumber]
      return next
    })

    // Clear any mulligans on this hole
    const updatedMulligans = { ...mulligans }
    const updatedMulliganHoles = { ...mulliganHoles }
    Object.keys(mulliganHoles).forEach((pid) => {
      if (mulliganHoles[pid] === holeNumber) {
        delete updatedMulligans[pid]
        delete updatedMulliganHoles[pid]
      }
    })
    setMulligans(updatedMulligans)
    setMulliganHoles(updatedMulliganHoles)

    for (const player of team.players) {
      await supabase
        .from("scores")
        .delete()
        .eq("tournament_id", tournamentId)
        .eq("round_number", 3)
        .eq("hole_number", holeNumber)
        .eq("player_id", player.id)
    }
  }

  // Calculate total points
  function getTotalPoints(): number {
    return round3TotalPoints(
      holes
        .filter((h) => scores[h.hole_number] && scores[h.hole_number] > 0)
        .map((h) => ({ par: h.par, strokes: scores[h.hole_number] }))
    )
  }

  if (loading) {
    return <p className="text-center text-green-600 py-8">Loading...</p>
  }

  const hole = holes.find((h) => h.hole_number === currentHole)
  if (!hole) return null

  const strokes = getStrokes(currentHole)
  const holeComplete = strokes > 0

  // Points for this hole
  let holePoints: number | null = null
  if (holeComplete) {
    holePoints = adjustedStablefordPoints(strokes, hole.par)
  }

  // Players who used their mulligan on THIS hole
  const mulligansOnThisHole = team.players.filter((p) => isMulliganOnThisHole(p.id))

  return (
    <div className="flex flex-col flex-1">
      {/* Mulligan tracker bar */}
      <div className="bg-purple-50 border-b border-purple-200 px-4 py-2">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-purple-800">Mulligans</span>
            <div className="flex gap-1">
              {team.players.map((p) => (
                <div
                  key={p.id}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    mulligans[p.id]
                      ? "bg-purple-200 text-purple-400 line-through"
                      : "bg-purple-500 text-white"
                  }`}
                  title={p.name}
                >
                  {p.name.charAt(0)}
                </div>
              ))}
            </div>
          </div>
          <span className="text-xs font-bold text-purple-700">
            {mulligansRemaining} remaining
          </span>
        </div>
      </div>

      {/* Hole info with dropdown */}
      <div className="px-4 pt-4 pb-2">
        <div className="max-w-md mx-auto">
          <div className="flex items-baseline justify-between">
            <div className="relative">
              <button
                onClick={() => setHoleDropdownOpen(!holeDropdownOpen)}
                className="flex items-center gap-1.5 text-xl font-bold text-green-900 hover:text-green-700 transition-colors"
              >
                Hole {currentHole}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${holeDropdownOpen ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {holeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-xl border border-green-200 shadow-lg z-20 p-2 grid grid-cols-6 gap-1 w-[240px]">
                  {holes.map((h) => {
                    const completed = scores[h.hole_number] && scores[h.hole_number] > 0
                    return (
                      <button
                        key={h.hole_number}
                        onClick={() => {
                          setCurrentHole(h.hole_number)
                          setHoleDropdownOpen(false)
                        }}
                        className={`h-8 rounded-lg text-xs font-bold transition-colors ${
                          h.hole_number === currentHole
                            ? "bg-green-700 text-white"
                            : completed
                            ? "bg-green-200 text-green-800"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {h.hole_number}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-3 text-sm text-green-600">
              <span>Par {hole.par}</span>
              {hole.yardage_red && <span>{hole.yardage_red} yds</span>}
            </div>
          </div>

          {/* Points result for this hole */}
          {holePoints !== null && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-medium ${
              holePoints > 0
                ? "bg-green-100 text-green-800"
                : holePoints === 0
                ? "bg-gray-100 text-gray-600"
                : "bg-red-50 text-red-700"
            }`}>
              {strokes} ({scoreLabel(strokes, hole.par)}) &rarr; {holePoints > 0 ? "+" : ""}{holePoints} {holePoints === 1 || holePoints === -1 ? "point" : "points"}
            </div>
          )}
        </div>
      </div>

      {/* Team score input — single score for scramble */}
      <div className="flex-1 px-4 pb-4">
        <div className="max-w-md mx-auto flex flex-col gap-3">
          <div className="rounded-xl bg-white border-2 border-green-100 p-6">
            <p className="text-center text-sm font-semibold text-green-900 mb-4">Team Score</p>

            {/* Stroke counter */}
            <div className="flex items-center justify-center gap-6 mb-2">
              <button
                onClick={() => adjustStrokes(currentHole, -1)}
                className="h-14 w-14 rounded-full bg-green-100 text-green-800 text-2xl font-bold flex items-center justify-center hover:bg-green-200 transition-colors"
              >
                &minus;
              </button>
              <span className="text-4xl font-bold text-green-900 w-16 text-center">
                {strokes || "\u2014"}
              </span>
              <button
                onClick={() => adjustStrokes(currentHole, 1)}
                className="h-14 w-14 rounded-full bg-green-100 text-green-800 text-2xl font-bold flex items-center justify-center hover:bg-green-200 transition-colors"
              >
                +
              </button>
            </div>

            {/* Score label */}
            {strokes > 0 && (
              <p className="text-xs text-center text-green-600 mb-4">
                {scoreLabel(strokes, hole.par)}
              </p>
            )}

            {/* Mulligan buttons */}
            <div className="border-t border-green-100 pt-4 mt-2">
              <p className="text-xs font-semibold text-purple-700 mb-2 text-center">
                Use a mulligan on this hole?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {team.players.map((player) => {
                  const usedHere = isMulliganOnThisHole(player.id)
                  const usedElsewhere = mulligans[player.id] && !usedHere
                  const canUse = canUseMulligan(player.id)

                  return (
                    <button
                      key={player.id}
                      onClick={() => {
                        if (usedHere) toggleMulligan(player.id)
                        else if (canUse) toggleMulligan(player.id)
                      }}
                      disabled={usedElsewhere}
                      className={`rounded-lg py-2 px-2 text-xs font-semibold transition-colors ${
                        usedHere
                          ? "bg-purple-500 text-white"
                          : usedElsewhere
                          ? "bg-gray-100 text-gray-300 line-through"
                          : "bg-gray-100 text-gray-600 hover:bg-purple-100 active:bg-purple-100"
                      }`}
                    >
                      {player.name.split(" ")[0]}
                      {usedElsewhere && " (H" + mulliganHoles[player.id] + ")"}
                    </button>
                  )
                })}
              </div>
              {mulligansOnThisHole.length > 0 && (
                <p className="text-xs text-purple-600 text-center mt-2">
                  {mulligansOnThisHole.map((p) => p.name.split(" ")[0]).join(", ")} used mulligan
                </p>
              )}
            </div>
          </div>

          {/* Prev/Next buttons */}
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

      {/* Click outside to close dropdown */}
      {holeDropdownOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setHoleDropdownOpen(false)}
        />
      )}
    </div>
  )
}
