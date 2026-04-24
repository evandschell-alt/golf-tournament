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
  [playerId: string]: {
    strokes: number
    moneyball_used: boolean
    moneyball_lost: boolean
  }
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
  const [, setSaving] = useState(false)
  const [holeDropdownOpen, setHoleDropdownOpen] = useState(false)
  // Moneyball tracking: per-player, which hole they used their moneyball on (if any)
  const [moneyballByPlayer, setMoneyballByPlayer] = useState<{ [playerId: string]: number }>({})

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
            // Group teammates together by sorting by team name
            players: [...groupMap[Number(gn)]].sort((a, b) => a.team_name.localeCompare(b.team_name)),
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
        const mbByPlayer: { [playerId: string]: number } = {}
        existingScores.forEach((s) => {
          if (!loaded[s.hole_number]) loaded[s.hole_number] = {}
          if (s.player_id) {
            loaded[s.hole_number][s.player_id] = {
              strokes: s.strokes,
              moneyball_used: s.moneyball_used,
              moneyball_lost: s.moneyball_lost,
            }
            if (s.moneyball_used) mbByPlayer[s.player_id] = s.hole_number
          }
        })
        setScores(loaded)
        setMoneyballByPlayer(mbByPlayer)
      } else {
        setScores({})
        setMoneyballByPlayer({})
      }
    }

    loadScores()
  }, [selectedFoursome, tournamentId])

  // Restore current hole for this foursome from localStorage
  useEffect(() => {
    if (!selectedFoursome) return
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`r2-hole-${tournamentId}-g${selectedFoursome.groupNumber}`)
      if (saved) setCurrentHole(parseInt(saved))
      else setCurrentHole(1)
    }
  }, [selectedFoursome, tournamentId])

  // Persist current hole per foursome
  useEffect(() => {
    if (!selectedFoursome) return
    if (typeof window !== "undefined") {
      localStorage.setItem(`r2-hole-${tournamentId}-g${selectedFoursome.groupNumber}`, String(currentHole))
    }
  }, [currentHole, selectedFoursome, tournamentId])

  // Get or initialize scores for a hole (default to 0 = blank)
  function getHoleScores(holeNumber: number): HoleScores {
    if (scores[holeNumber]) return scores[holeNumber]
    const init: HoleScores = {}
    selectedFoursome?.players.forEach((p) => {
      init[p.id] = { strokes: 0, moneyball_used: false, moneyball_lost: false }
    })
    return init
  }

  function setStrokes(holeNumber: number, playerId: string, strokes: number) {
    const holeScores = { ...getHoleScores(holeNumber) }
    holeScores[playerId] = { ...holeScores[playerId], strokes }
    setScores({ ...scores, [holeNumber]: holeScores })
  }

  function adjustStrokes(holeNumber: number, playerId: string, delta: number) {
    const current = getHoleScores(holeNumber)[playerId]?.strokes || 0
    if (current === 0) {
      const hole = holes.find((h) => h.hole_number === holeNumber)
      const par = hole?.par || 4
      setStrokes(holeNumber, playerId, par)
    } else {
      const newVal = Math.max(1, current + delta)
      setStrokes(holeNumber, playerId, newVal)
    }
  }

  // Toggle moneyball — each player has their own moneyball, tracked per-round
  function toggleMoneyball(holeNumber: number, playerId: string) {
    const holeScores = { ...getHoleScores(holeNumber) }
    const playerScore = { ...holeScores[playerId] }

    if (playerScore.moneyball_used) {
      playerScore.moneyball_used = false
      playerScore.moneyball_lost = false
      holeScores[playerId] = playerScore
      setScores({ ...scores, [holeNumber]: holeScores })
      setMoneyballByPlayer((prev) => {
        const next = { ...prev }
        delete next[playerId]
        return next
      })
    } else {
      playerScore.moneyball_used = true
      holeScores[playerId] = playerScore
      setScores({ ...scores, [holeNumber]: holeScores })
      setMoneyballByPlayer((prev) => ({ ...prev, [playerId]: holeNumber }))
    }
  }

  function toggleMoneyballLost(holeNumber: number, playerId: string) {
    const holeScores = { ...getHoleScores(holeNumber) }
    const playerScore = { ...holeScores[playerId] }
    playerScore.moneyball_lost = !playerScore.moneyball_lost
    holeScores[playerId] = playerScore
    setScores({ ...scores, [holeNumber]: holeScores })
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
      const ps = holeScores[p.id]
      filledScores[p.id] = {
        ...ps,
        strokes: ps.strokes === 0 ? par : ps.strokes,
      }
    })

    setScores((prev) => ({ ...prev, [holeNumber]: filledScores }))

    for (const player of selectedFoursome.players) {
      const ps = filledScores[player.id]
      const { error } = await supabase
        .from("scores")
        .upsert(
          {
            tournament_id: tournamentId,
            round_number: 2,
            hole_number: holeNumber,
            player_id: player.id,
            team_id: player.team_id,
            strokes: ps.strokes,
            moneyball_used: ps.moneyball_used,
            moneyball_lost: ps.moneyball_lost,
          },
          { onConflict: "tournament_id,round_number,hole_number,player_id" }
        )
      if (error) console.error("Save error:", error)
    }

    setSaving(false)
  }

  // Calculate skins results for completed holes (applies moneyball adjustment)
  function getSkinsResults() {
    if (!selectedFoursome) return null

    const completedHoles: { holeNumber: number; players: { playerId: string; teamId: string; strokes: number }[] }[] = []

    holes.forEach((hole) => {
      const hs = scores[hole.hole_number]
      if (!hs) return
      const allEntered = selectedFoursome.players.every((p) => hs[p.id]?.strokes > 0)
      if (!allEntered) return

      completedHoles.push({
        holeNumber: hole.hole_number,
        players: selectedFoursome.players.map((p) => {
          const ps = hs[p.id]
          // Moneyball reduces effective strokes by 1 unless the ball was lost
          const adjusted = ps.strokes - (ps.moneyball_used && !ps.moneyball_lost ? 1 : 0)
          return {
            playerId: p.id,
            teamId: p.team_id,
            strokes: adjusted,
          }
        }),
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
              onClick={() => setSelectedFoursome(f)}
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
      <div className="bg-yellow-50 border-b border-yellow-300 px-4 py-3">
        <div className="max-w-md mx-auto">
          <div className="flex flex-col gap-1.5">
            {Object.entries(skinsResults ? skinsResults.teamSkins : {}).map(([teamId, skins]) => {
              const teamName = selectedFoursome.players.find((p) => p.team_id === teamId)?.team_name || "?"
              return (
                <div key={teamId} className="flex items-center justify-between">
                  <span className="text-sm font-bold text-yellow-900">{teamName}</span>
                  <span className="text-sm font-bold text-yellow-800">
                    {skins % 1 === 0 ? skins : skins.toFixed(1)} skins
                  </span>
                </div>
              )
            })}
            {(!skinsResults || Object.keys(skinsResults.teamSkins).length === 0) && teamNames.map((name) => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-sm font-bold text-yellow-900">{name}</span>
                <span className="text-sm font-bold text-yellow-800">0 skins</span>
              </div>
            ))}
          </div>
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
                    const completed = hs && selectedFoursome.players.every((p) => hs[p.id]?.strokes > 0)
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
              const winningPlayers = selectedFoursome.players.filter((p) =>
                holeResult.winner!.playerIds.includes(p.id)
              )
              const teamName = selectedFoursome.players.find(
                (p) => p.team_id === holeResult.winner!.teamId
              )?.team_name || ""
              // One player alone had the team's best ball → show their name.
              // Both teammates tied for it → show the team name.
              const label = winningPlayers.length === 1 ? winningPlayers[0].name : teamName
              return (
                <div className="mt-2 rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-800">
                  {label} wins {holeResult.skinsWon} skin{holeResult.skinsWon !== 1 ? "s" : ""}!
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
            const ps = holeScores[player.id] || { strokes: 0, moneyball_used: false, moneyball_lost: false }
            const strokes = ps.strokes

            // Check if this player won the skin on this hole
            let wonSkin = false
            if (skinsResults) {
              const holeResult = skinsResults.holeResults.find((r) => r.holeNumber === currentHole)
              if (holeResult?.winner?.playerIds.includes(player.id)) wonSkin = true
            }

            // Per-player moneyball state
            const playerMbHole = moneyballByPlayer[player.id] ?? null
            const mbUsedOnThisHole = playerMbHole === currentHole
            const mbUsedElsewhere = playerMbHole !== null && playerMbHole !== currentHole

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
                <div className="flex items-center justify-center gap-4 mb-3">
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

                {/* Moneyball — always visible; strikethrough if already used on a different hole */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => !mbUsedElsewhere && toggleMoneyball(currentHole, player.id)}
                    disabled={mbUsedElsewhere}
                    className={`w-full rounded-lg py-2 text-xs font-semibold transition-colors ${
                      mbUsedOnThisHole
                        ? "bg-yellow-400 text-yellow-900"
                        : mbUsedElsewhere
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed line-through"
                        : "bg-gray-100 text-gray-500 hover:bg-yellow-100"
                    }`}
                  >
                    {mbUsedOnThisHole
                      ? "Moneyball Active"
                      : mbUsedElsewhere
                      ? `Used on Hole ${playerMbHole}`
                      : "Use Moneyball"}
                  </button>

                  {mbUsedOnThisHole && (
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

                {/* Score label */}
                {strokes > 0 && (
                  <p className="text-xs text-center text-green-600 mt-2">
                    {scoreLabel(strokes, hole.par)}
                    {ps.moneyball_used && !ps.moneyball_lost && (
                      <span className="text-yellow-600"> (adjusted: {strokes - 1})</span>
                    )}
                  </p>
                )}
              </div>
            )
          })}

          {/* Prev/Next buttons */}
          <div className="flex gap-3 mt-2 pb-4">
            <button
              onClick={() => {
                if (currentHole > 1) setCurrentHole(currentHole - 1)
              }}
              disabled={currentHole === 1}
              className="flex-1 rounded-xl border-2 border-green-700 py-3 text-sm font-semibold text-green-700 disabled:opacity-30 transition-colors"
            >
              &larr; Prev
            </button>
            <button
              onClick={async () => {
                if (currentHole < 18) {
                  saveHoleScores(currentHole)
                  setCurrentHole(currentHole + 1)
                } else {
                  await saveHoleScores(18)
                }
              }}
              className="flex-1 rounded-xl bg-green-700 py-3 text-sm font-semibold text-white shadow-sm transition-colors"
            >
              {currentHole < 18 ? "Next \u2192" : "Finish \u2713"}
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
