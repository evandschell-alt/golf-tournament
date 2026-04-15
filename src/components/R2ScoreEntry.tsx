"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { calculateSkins, scoreLabel } from "@/lib/scoring"

type Player = { id: string; name: string; team_id: string; team_name: string }
type Hole = { hole_number: number; par: number; yardage_blue: number | null }

type Foursome = {
  groupNumber: number
  players: Player[]
}

type HoleScores = {
  [playerId: string]: number // just strokes for skins, no moneyball
}

type Props = {
  tournamentId: string
  initialFoursomeIndex?: number
}

export default function R2ScoreEntry({ tournamentId, initialFoursomeIndex }: Props) {
  const [foursomes, setFoursomes] = useState<Foursome[]>([])
  const [selectedFoursome, setSelectedFoursome] = useState<Foursome | null>(null)
  const [holes, setHoles] = useState<Hole[]>([])
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<{ [holeNumber: number]: HoleScores }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [holeDropdownOpen, setHoleDropdownOpen] = useState(false)

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
          .select("hole_number, par, yardage_blue")
          .eq("course_id", tournament.course_id)
          .order("hole_number")
        setHoles(holesData || [])
      }

      // Fetch R2 pairings with player and team info
      const { data: pairings } = await supabase
        .from("r2_pairings")
        .select("group_number, player_id, players(id, name, team_id, teams(name))")
        .eq("tournament_id", tournamentId)
        .order("group_number")

      if (pairings) {
        // Group by group_number
        const groupMap: { [key: number]: Player[] } = {}
        pairings.forEach((p: Record<string, unknown>) => {
          const gn = p.group_number as number
          if (!groupMap[gn]) groupMap[gn] = []
          const playerData = p.players as Record<string, unknown>
          if (playerData) {
            const teamData = playerData.teams as Record<string, unknown>
            groupMap[gn].push({
              id: playerData.id as string,
              name: playerData.name as string,
              team_id: playerData.team_id as string,
              team_name: teamData ? (teamData.name as string) : "",
            })
          }
        })

        const foursomeList = Object.keys(groupMap)
          .sort((a, b) => Number(a) - Number(b))
          .map((gn) => ({
            groupNumber: Number(gn),
            players: groupMap[Number(gn)],
          }))

        setFoursomes(foursomeList)

        // Auto-select first foursome or from prop
        if (foursomeList.length > 0) {
          const idx = initialFoursomeIndex !== undefined ? initialFoursomeIndex : 0
          setSelectedFoursome(foursomeList[idx] || foursomeList[0])
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [tournamentId, initialFoursomeIndex])

  // Load existing R2 scores when foursome is selected
  useEffect(() => {
    if (!selectedFoursome) return

    const loadScores = async () => {
      const playerIds = selectedFoursome.players.map((p) => p.id)
      const { data: existingScores } = await supabase
        .from("scores")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("round_number", 2)
        .in("player_id", playerIds)

      if (existingScores && existingScores.length > 0) {
        const loaded: { [holeNumber: number]: HoleScores } = {}
        existingScores.forEach((s) => {
          if (!loaded[s.hole_number]) loaded[s.hole_number] = {}
          if (s.player_id) {
            loaded[s.hole_number][s.player_id] = s.strokes
          }
        })
        setScores(loaded)
      } else {
        setScores({})
      }
    }

    loadScores()
  }, [selectedFoursome, tournamentId])

  // Get or initialize scores for a hole (default to 0 = blank)
  function getHoleScores(holeNumber: number): HoleScores {
    if (scores[holeNumber]) return scores[holeNumber]
    const init: HoleScores = {}
    selectedFoursome?.players.forEach((p) => {
      init[p.id] = 0
    })
    return init
  }

  function setStrokes(holeNumber: number, playerId: string, strokes: number) {
    const holeScores = { ...getHoleScores(holeNumber) }
    holeScores[playerId] = strokes
    setScores({ ...scores, [holeNumber]: holeScores })
  }

  function adjustStrokes(holeNumber: number, playerId: string, delta: number) {
    const current = getHoleScores(holeNumber)[playerId] || 0
    if (current === 0) {
      const hole = holes.find((h) => h.hole_number === holeNumber)
      const par = hole?.par || 4
      setStrokes(holeNumber, playerId, par)
    } else {
      const newVal = Math.max(1, current + delta)
      setStrokes(holeNumber, playerId, newVal)
    }
  }

  // Save scores for a hole
  async function saveHoleScores(holeNumber: number) {
    if (!selectedFoursome) return
    setSaving(true)

    const hole = holes.find((h) => h.hole_number === holeNumber)
    const par = hole?.par || 4
    const holeScores = getHoleScores(holeNumber)

    // Fill in par for untouched players
    const filledScores: HoleScores = {}
    selectedFoursome.players.forEach((p) => {
      filledScores[p.id] = holeScores[p.id] === 0 ? par : holeScores[p.id]
    })

    setScores((prev) => ({ ...prev, [holeNumber]: filledScores }))

    for (const player of selectedFoursome.players) {
      const { error } = await supabase
        .from("scores")
        .upsert(
          {
            tournament_id: tournamentId,
            round_number: 2,
            hole_number: holeNumber,
            player_id: player.id,
            team_id: player.team_id,
            strokes: filledScores[player.id],
            moneyball_used: false,
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
    if (!selectedFoursome) return

    setScores((prev) => {
      const next = { ...prev }
      delete next[holeNumber]
      return next
    })

    for (const player of selectedFoursome.players) {
      await supabase
        .from("scores")
        .delete()
        .eq("tournament_id", tournamentId)
        .eq("round_number", 2)
        .eq("hole_number", holeNumber)
        .eq("player_id", player.id)
    }
  }

  // Calculate skins results for completed holes
  function getSkinsResults() {
    if (!selectedFoursome) return null

    const completedHoles: { holeNumber: number; players: { playerId: string; teamId: string; strokes: number }[] }[] = []

    holes.forEach((hole) => {
      const hs = scores[hole.hole_number]
      if (!hs) return
      const allEntered = selectedFoursome.players.every((p) => hs[p.id] > 0)
      if (!allEntered) return

      completedHoles.push({
        holeNumber: hole.hole_number,
        players: selectedFoursome.players.map((p) => ({
          playerId: p.id,
          teamId: p.team_id,
          strokes: hs[p.id],
        })),
      })
    })

    if (completedHoles.length === 0) return null
    return calculateSkins(completedHoles)
  }

  if (loading) {
    return <p className="text-center text-green-600 py-8">Loading...</p>
  }

  if (foursomes.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-green-700 font-medium">No R2 pairings set up yet.</p>
        <p className="text-sm text-green-500 mt-1">Go to Settings to configure Round 2 pairings.</p>
      </div>
    )
  }

  if (!selectedFoursome) return null

  const hole = holes.find((h) => h.hole_number === currentHole)
  if (!hole) return null

  const holeScores = getHoleScores(currentHole)
  const allEntered = selectedFoursome.players.every((p) => holeScores[p.id] > 0)
  const skinsResults = getSkinsResults()

  // Get team names in this foursome
  const teamNames = [...new Set(selectedFoursome.players.map((p) => p.team_name))]

  return (
    <div className="flex flex-col flex-1">
      {/* Foursome selector */}
      <div className="bg-white border-b border-green-200 px-4 py-2">
        <div className="max-w-md mx-auto flex gap-2">
          {foursomes.map((f) => (
            <button
              key={f.groupNumber}
              onClick={() => {
                setSelectedFoursome(f)
                setCurrentHole(1)
              }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                selectedFoursome.groupNumber === f.groupNumber
                  ? "bg-green-700 text-white"
                  : "bg-green-50 text-green-700 hover:bg-green-100"
              }`}
            >
              Group {f.groupNumber}
            </button>
          ))}
        </div>
      </div>

      {/* Skins tracker bar */}
      {skinsResults && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex gap-3">
              {Object.entries(skinsResults.teamSkins).map(([teamId, skins]) => {
                const teamName = selectedFoursome.players.find((p) => p.team_id === teamId)?.team_name || "?"
                return (
                  <span key={teamId} className="text-xs font-semibold text-green-800">
                    {teamName}: {skins % 1 === 0 ? skins : skins.toFixed(1)} skins
                  </span>
                )
              })}
            </div>
            {skinsResults.currentCarryOver > 0 && (
              <span className="text-xs font-bold text-yellow-700 bg-yellow-200 px-2 py-0.5 rounded-full">
                {skinsResults.currentCarryOver} on the line!
              </span>
            )}
          </div>
        </div>
      )}

      {/* Foursome info */}
      <div className="bg-green-50 px-4 py-2 border-b border-green-100">
        <div className="max-w-md mx-auto">
          <p className="text-xs text-green-600">
            {teamNames.join(" vs ")} &middot; {selectedFoursome.players.map((p) => p.name).join(", ")}
          </p>
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
                    const hs = scores[h.hole_number]
                    const completed = hs && selectedFoursome.players.every((p) => hs[p.id] > 0)
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
              {hole.yardage_blue && <span>{hole.yardage_blue} yds</span>}
            </div>
          </div>

          {/* Skins status for this hole */}
          {skinsResults && (() => {
            const holeResult = skinsResults.holeResults.find((r) => r.holeNumber === currentHole)
            if (!holeResult) {
              // Show how many skins are at stake
              const prevHoles = skinsResults.holeResults.filter((r) => r.holeNumber < currentHole)
              const carry = prevHoles.length > 0 ? prevHoles[prevHoles.length - 1].carryOver : 0
              if (carry > 0) {
                return (
                  <div className="mt-2 rounded-lg bg-yellow-100 px-3 py-2 text-sm font-medium text-yellow-800">
                    {carry + 1} skins at stake on this hole
                  </div>
                )
              }
              return null
            }

            if (holeResult.winner) {
              const winnerPlayer = selectedFoursome.players.find((p) => p.id === holeResult.winner!.playerId)
              return (
                <div className="mt-2 rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-800">
                  {winnerPlayer?.name} wins {holeResult.skinsWon} skin{holeResult.skinsWon !== 1 ? "s" : ""}!
                </div>
              )
            } else if (holeResult.carryOver > 0) {
              return (
                <div className="mt-2 rounded-lg bg-yellow-100 px-3 py-2 text-sm font-medium text-yellow-800">
                  Tie! {holeResult.carryOver} skin{holeResult.carryOver !== 1 ? "s" : ""} carry over
                </div>
              )
            } else if (holeResult.skinsWon > 0) {
              return (
                <div className="mt-2 rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-800">
                  Hole 18 split: {holeResult.skinsWon} skin{holeResult.skinsWon !== 1 ? "s" : ""} divided
                </div>
              )
            }
            return null
          })()}
        </div>
      </div>

      {/* Player score inputs */}
      <div className="flex-1 px-4 pb-4">
        <div className="max-w-md mx-auto flex flex-col gap-3">
          {selectedFoursome.players.map((player) => {
            const strokes = holeScores[player.id] || 0

            // Check if this player won the skin on this hole
            let wonSkin = false
            if (skinsResults) {
              const holeResult = skinsResults.holeResults.find((r) => r.holeNumber === currentHole)
              if (holeResult?.winner?.playerId === player.id) wonSkin = true
            }

            return (
              <div
                key={player.id}
                className={`rounded-xl bg-white border-2 p-4 ${
                  wonSkin ? "border-yellow-400" : "border-green-100"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-green-900 text-sm">{player.name}</span>
                  <span className="text-xs text-green-500">{player.team_name}</span>
                </div>

                {/* Stroke counter */}
                <div className="flex items-center justify-center gap-4 mb-1">
                  <button
                    onClick={() => adjustStrokes(currentHole, player.id, -1)}
                    className="h-12 w-12 rounded-full bg-green-100 text-green-800 text-xl font-bold flex items-center justify-center hover:bg-green-200 transition-colors"
                  >
                    &minus;
                  </button>
                  <span className="text-3xl font-bold text-green-900 w-12 text-center">
                    {strokes || "\u2014"}
                  </span>
                  <button
                    onClick={() => adjustStrokes(currentHole, player.id, 1)}
                    className="h-12 w-12 rounded-full bg-green-100 text-green-800 text-xl font-bold flex items-center justify-center hover:bg-green-200 transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Score label */}
                {strokes > 0 && (
                  <p className="text-xs text-center text-green-600">
                    {scoreLabel(strokes, hole.par)}
                  </p>
                )}
              </div>
            )
          })}

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
