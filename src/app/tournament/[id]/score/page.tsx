"use client"

import { useState, useEffect, use } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { round1HolePoints, scoreLabel, calculateSkins, adjustedStablefordPoints } from "@/lib/scoring"
import BottomNav from "@/components/BottomNav"
import R2ScoreEntry from "@/components/R2ScoreEntry"
import R3ScoreEntry from "@/components/R3ScoreEntry"

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

const ROUND_LABELS: { [key: number]: string } = {
  1: "Best Ball",
  2: "Skins",
  3: "Scramble",
}

export default function ScoreEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params)
  const searchParams = useSearchParams()
  const teamIdFromUrl = searchParams.get("team")
  const roundFromUrl = searchParams.get("round")

  // State
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [holes, setHoles] = useState<Hole[]>([])
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<{ [holeNumber: number]: HoleScores }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tournamentName, setTournamentName] = useState("")
  const [roundNumber, setRoundNumber] = useState(roundFromUrl ? parseInt(roundFromUrl) : 1)
  const [roundDropdownOpen, setRoundDropdownOpen] = useState(false)
  const [allScores, setAllScores] = useState<{ team_id: string; round_number: number; hole_number: number; strokes: number; moneyball_used: boolean; moneyball_lost: boolean; player_id: string | null }[]>([])
  const [r2Pairings, setR2Pairings] = useState<{ group_number: number; player_id: string }[]>([])
  const [allPlayers, setAllPlayers] = useState<{ id: string; team_id: string }[]>([])

  // Moneyball tracking: which hole was the moneyball used on (if any)
  const [moneyballHole, setMoneyballHole] = useState<number | null>(null)
  const [teeBox, setTeeBox] = useState<string>("white")
  const [holeDropdownOpen, setHoleDropdownOpen] = useState(false)

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

        // Auto-select team from URL param
        if (teamIdFromUrl) {
          const urlTeam = sorted.find((t) => t.id === teamIdFromUrl)
          if (urlTeam) setSelectedTeam(urlTeam)
        }

        // Fetch all players for total points calc
        const { data: playersData } = await supabase
          .from("players")
          .select("id, team_id")
          .in("team_id", sorted.map((t) => t.id))
        setAllPlayers(playersData || [])
      }

      // Fetch all scores across all rounds (for total points)
      const { data: allScoresData } = await supabase
        .from("scores")
        .select("team_id, round_number, hole_number, strokes, moneyball_used, moneyball_lost, player_id")
        .eq("tournament_id", tournamentId)
      setAllScores(allScoresData || [])

      // Fetch R2 pairings
      const { data: pairingsData } = await supabase
        .from("r2_pairings")
        .select("group_number, player_id")
        .eq("tournament_id", tournamentId)
      setR2Pairings(pairingsData || [])

      setLoading(false)
    }

    fetchData()
  }, [tournamentId])

  // Fetch tee box for the current round
  useEffect(() => {
    const fetchTeeBox = async () => {
      const { data: roundSettings } = await supabase
        .from("round_settings")
        .select("tee_box")
        .eq("tournament_id", tournamentId)
        .eq("round_number", roundNumber)
        .single()

      if (roundSettings?.tee_box) {
        setTeeBox(roundSettings.tee_box)
      } else {
        // Default tee boxes by round
        const defaults: { [key: number]: string } = { 1: "white", 2: "blue", 3: "red" }
        setTeeBox(defaults[roundNumber] || "white")
      }
    }

    fetchTeeBox()
  }, [tournamentId, roundNumber])

  // Load existing scores when team or round changes
  useEffect(() => {
    if (!selectedTeam) return
    if (roundNumber === 2) return // R2 handles its own scores in R2ScoreEntry

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
  // R1 points for the selected team (from local state for current round editing)
  function getR1Points(): number {
    if (!selectedTeam) return 0
    let total = 0
    holes.forEach((hole) => {
      const hs = scores[hole.hole_number]
      if (!hs) return
      const players = selectedTeam.players
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

  // Get round points for a specific team from allScores (for non-active rounds)
  function getRoundPoints(teamId: string, round: number): number {
    if (round === 1) {
      // R1 Best Ball
      const teamR1 = allScores.filter((s) => s.team_id === teamId && s.round_number === 1)
      const playerIds = [...new Set(teamR1.filter((s) => s.player_id).map((s) => s.player_id!))]
      let pts = 0
      holes.forEach((hole) => {
        const holeScores = playerIds.map((pid) =>
          teamR1.find((s) => s.hole_number === hole.hole_number && s.player_id === pid)
        )
        if (holeScores.every((s) => s && s.strokes > 0) && holeScores.length >= 4) {
          const pd = holeScores.map((s) => ({
            strokes: s!.strokes,
            moneyball_used: s!.moneyball_used,
            moneyball_lost: s!.moneyball_lost,
          }))
          pts += round1HolePoints(pd, hole.par).points
        }
      })
      return pts
    }

    if (round === 2) {
      // R2 Skins
      const foursomeGroups: { [g: number]: string[] } = {}
      r2Pairings.forEach((p) => {
        if (!foursomeGroups[p.group_number]) foursomeGroups[p.group_number] = []
        foursomeGroups[p.group_number].push(p.player_id)
      })

      const r2Scores = allScores.filter((s) => s.round_number === 2)
      let teamSkins = 0

      Object.values(foursomeGroups).forEach((playerIds) => {
        const foursomeHoles: { holeNumber: number; players: { playerId: string; teamId: string; strokes: number }[] }[] = []
        holes.forEach((hole) => {
          const holePlayers = playerIds.map((pid) => {
            const score = r2Scores.find((s) => s.player_id === pid && s.hole_number === hole.hole_number)
            const player = allPlayers.find((p) => p.id === pid)
            return { playerId: pid, teamId: player?.team_id || "", strokes: score?.strokes || 0 }
          })
          if (holePlayers.every((p) => p.strokes > 0)) {
            foursomeHoles.push({ holeNumber: hole.hole_number, players: holePlayers })
          }
        })

        if (foursomeHoles.length > 0) {
          const result = calculateSkins(foursomeHoles)
          teamSkins += result.teamSkins[teamId] || 0
        }
      })
      return teamSkins
    }

    if (round === 3) {
      // R3 Scramble
      const teamR3 = allScores.filter((s) => s.team_id === teamId && s.round_number === 3)
      const r3HoleScores: { [h: number]: number } = {}
      teamR3.forEach((s) => { if (s.strokes > 0) r3HoleScores[s.hole_number] = s.strokes })

      let pts = 0
      holes.forEach((hole) => {
        const strokes = r3HoleScores[hole.hole_number]
        if (strokes && strokes > 0) pts += adjustedStablefordPoints(strokes, hole.par)
      })
      return pts
    }

    return 0
  }

  // Current round points (uses live editing state for R1, allScores for R2/R3)
  function getCurrentRoundPoints(): number {
    if (!selectedTeam) return 0
    if (roundNumber === 1) return getR1Points()
    return getRoundPoints(selectedTeam.id, roundNumber)
  }

  // Total tournament points across all 3 rounds
  function getTotalTournamentPoints(): number {
    if (!selectedTeam) return 0
    const r1 = roundNumber === 1 ? getR1Points() : getRoundPoints(selectedTeam.id, 1)
    const r2 = getRoundPoints(selectedTeam.id, 2)
    const r3 = getRoundPoints(selectedTeam.id, 3)
    return r1 + r2 + r3
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
      <div className="flex flex-col flex-1 bg-green-50">
        <div className="flex-1 px-4 py-8">
          <div className="max-w-md mx-auto">
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
        <BottomNav tournamentId={tournamentId} />
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
      {/* Close round dropdown overlay — must be BEFORE the header so header content stays on top */}
      {roundDropdownOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setRoundDropdownOpen(false)}
        />
      )}

      {/* Sticky header */}
      <div className="sticky top-0 z-40 bg-green-700 text-white px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <div className="relative">
              <button
                onClick={() => setRoundDropdownOpen(!roundDropdownOpen)}
                className="flex items-center gap-1.5 font-bold text-sm bg-green-600 rounded-lg px-2.5 py-1 hover:bg-green-500 active:bg-green-500 transition-colors"
              >
                Round {roundNumber} &middot; {ROUND_LABELS[roundNumber]}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${roundDropdownOpen ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {roundDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 bg-white rounded-xl border border-green-200 shadow-lg z-50 overflow-hidden min-w-[180px]">
                  {[1, 2, 3].map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setRoundNumber(r)
                        setRoundDropdownOpen(false)
                        setCurrentHole(1)
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                        r === roundNumber
                          ? "bg-green-100 text-green-800"
                          : "text-gray-700 hover:bg-green-50"
                      }`}
                    >
                      Round {r} &middot; {ROUND_LABELS[r]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-green-200 capitalize pl-2.5 mt-0.5">{teeBox} Tees</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-sm">{selectedTeam.name}</p>
            <p className="text-xs text-green-200">
              {getCurrentRoundPoints()} RD &middot; {getTotalTournamentPoints()} TOT
            </p>
          </div>
        </div>
      </div>

      {/* Round 2: Skins — completely different UI */}
      {roundNumber === 2 && (
        <R2ScoreEntry tournamentId={tournamentId} />
      )}

      {/* Round 3: Scramble — single team score + mulligans */}
      {roundNumber === 3 && (
        <R3ScoreEntry tournamentId={tournamentId} team={selectedTeam} />
      )}

      {/* Round 1: Best Ball */}
      {roundNumber === 1 && (
      <div className="flex flex-col flex-1">
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

              {/* Hole dropdown */}
              {holeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-xl border border-green-200 shadow-lg z-20 p-2 grid grid-cols-6 gap-1 w-[240px]">
                  {holes.map((h) => {
                    const hs = scores[h.hole_number]
                    const completed = hs && selectedTeam.players.every((p) => hs[p.id]?.strokes > 0)
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

      {/* Click outside to close dropdown */}
      {holeDropdownOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setHoleDropdownOpen(false)}
        />
      )}

      <BottomNav tournamentId={tournamentId} teamId={selectedTeam?.id} roundNumber={roundNumber} />
    </div>
  )
}
