"use client"

import { useState, useEffect, use } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { round1HolePoints, calculateSkins, adjustedStablefordPoints } from "@/lib/scoring"
import BottomNav from "@/components/BottomNav"

type Player = { id: string; name: string; sort_order: number; team_id?: string }
type Team = { id: string; name: string; players: Player[] }
type Hole = { hole_number: number; par: number }

type ScoreRow = {
  team_id: string
  player_id: string | null
  round_number: number
  hole_number: number
  strokes: number
  moneyball_used: boolean
  moneyball_lost: boolean
}

type R2Pairing = { group_number: number; player_id: string }

export default function ScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params)
  const searchParams = useSearchParams()
  const teamIdFromUrl = searchParams.get("team")
  const roundFromUrl = searchParams.get("round")

  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [holes, setHoles] = useState<Hole[]>([])
  const [allScores, setAllScores] = useState<ScoreRow[]>([])
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [r2Pairings, setR2Pairings] = useState<R2Pairing[]>([])
  const [loading, setLoading] = useState(true)
  const [tournamentName, setTournamentName] = useState("")

  const [roundNumber] = useState(() => {
    if (roundFromUrl) return parseInt(roundFromUrl)
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`round-${tournamentId}`)
      if (saved) return parseInt(saved)
    }
    return 1
  })

  // Which rounds are expanded
  const [expandedRounds, setExpandedRounds] = useState<{ [r: number]: boolean }>({
    1: false,
    2: false,
    3: false,
  })

  function toggleRound(r: number) {
    setExpandedRounds((prev) => ({ ...prev, [r]: !prev[r] }))
  }

  useEffect(() => {
    const fetchData = async () => {
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("name, year, course_id")
        .eq("id", tournamentId)
        .single()

      if (tournament) {
        setTournamentName(`${tournament.name} ${tournament.year}`)

        if (tournament.course_id) {
          const { data: holesData } = await supabase
            .from("holes")
            .select("hole_number, par")
            .eq("course_id", tournament.course_id)
            .order("hole_number")
          setHoles(holesData || [])
        }
      }

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

        if (teamIdFromUrl) {
          const urlTeam = sorted.find((t) => t.id === teamIdFromUrl)
          if (urlTeam) setSelectedTeam(urlTeam)
        }

        // All players for skins mapping
        const { data: playersData } = await supabase
          .from("players")
          .select("id, name, sort_order, team_id")
          .in("team_id", sorted.map((t) => t.id))
        setAllPlayers(playersData || [])
      }

      // All scores
      const { data: scoresData } = await supabase
        .from("scores")
        .select("team_id, player_id, round_number, hole_number, strokes, moneyball_used, moneyball_lost")
        .eq("tournament_id", tournamentId)
      setAllScores(scoresData || [])

      // R2 pairings
      const { data: pairingsData } = await supabase
        .from("r2_pairings")
        .select("group_number, player_id")
        .eq("tournament_id", tournamentId)
      setR2Pairings(pairingsData || [])

      setLoading(false)
    }

    fetchData()
  }, [tournamentId, teamIdFromUrl])

  // ===== R1 CALCULATIONS =====
  function getR1HoleData(holeNumber: number): { playerScores: { name: string; strokes: number }[]; bestScore: number; points: number } | null {
    if (!selectedTeam) return null
    const teamR1 = allScores.filter((s) => s.team_id === selectedTeam.id && s.round_number === 1)
    const hole = holes.find((h) => h.hole_number === holeNumber)
    if (!hole) return null

    const playerScores = selectedTeam.players.map((p) => {
      const score = teamR1.find((s) => s.hole_number === holeNumber && s.player_id === p.id)
      return { name: p.name, strokes: score?.strokes || 0, moneyball_used: score?.moneyball_used || false, moneyball_lost: score?.moneyball_lost || false }
    })

    const allEntered = playerScores.every((p) => p.strokes > 0)
    if (!allEntered) return null

    const result = round1HolePoints(
      playerScores.map((p) => ({ strokes: p.strokes, moneyball_used: p.moneyball_used, moneyball_lost: p.moneyball_lost })),
      hole.par
    )

    return {
      playerScores: playerScores.map((p) => ({ name: p.name, strokes: p.strokes })),
      bestScore: result.bestScore,
      points: result.points,
    }
  }

  function getR1Total(): { points: number; completed: number } {
    let points = 0
    let completed = 0
    holes.forEach((h) => {
      const data = getR1HoleData(h.hole_number)
      if (data) { points += data.points; completed++ }
    })
    return { points, completed }
  }

  // ===== R2 CALCULATIONS =====
  function getR2SkinsForTeam(): { teamSkins: number; completed: number; holeResults: { holeNumber: number; winner: string | null; skinsWon: number; carryOver: number }[] } {
    if (!selectedTeam) return { teamSkins: 0, completed: 0, holeResults: [] }

    // Find foursomes that include players from this team
    const teamPlayerIds = selectedTeam.players.map((p) => p.id)
    const foursomeGroups: { [g: number]: string[] } = {}
    r2Pairings.forEach((p) => {
      if (!foursomeGroups[p.group_number]) foursomeGroups[p.group_number] = []
      foursomeGroups[p.group_number].push(p.player_id)
    })

    const r2Scores = allScores.filter((s) => s.round_number === 2)
    let teamSkins = 0
    let completed = 0
    const allHoleResults: { holeNumber: number; winner: string | null; skinsWon: number; carryOver: number }[] = []

    Object.values(foursomeGroups).forEach((playerIds) => {
      // Only process foursomes that have players from this team
      const hasTeamPlayer = playerIds.some((pid) => teamPlayerIds.includes(pid))
      if (!hasTeamPlayer) return

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
        teamSkins += result.teamSkins[selectedTeam.id] || 0
        completed = Math.max(completed, foursomeHoles.length)

        result.holeResults.forEach((hr) => {
          const winnerPlayer = hr.winner ? allPlayers.find((p) => p.id === hr.winner!.playerId) : null
          allHoleResults.push({
            holeNumber: hr.holeNumber,
            winner: winnerPlayer?.name || null,
            skinsWon: hr.skinsWon,
            carryOver: hr.carryOver,
          })
        })
      }
    })

    return { teamSkins, completed, holeResults: allHoleResults.sort((a, b) => a.holeNumber - b.holeNumber) }
  }

  // ===== R3 CALCULATIONS =====
  function getR3HoleData(holeNumber: number): { strokes: number; points: number } | null {
    if (!selectedTeam) return null
    const teamR3 = allScores.filter((s) => s.team_id === selectedTeam.id && s.round_number === 3)
    const hole = holes.find((h) => h.hole_number === holeNumber)
    if (!hole) return null

    const score = teamR3.find((s) => s.hole_number === holeNumber && s.strokes > 0)
    if (!score) return null

    return { strokes: score.strokes, points: adjustedStablefordPoints(score.strokes, hole.par) }
  }

  function getR3Total(): { points: number; completed: number } {
    let points = 0
    let completed = 0
    holes.forEach((h) => {
      const data = getR3HoleData(h.hole_number)
      if (data) { points += data.points; completed++ }
    })
    return { points, completed }
  }

  // ===== TOTAL POINTS =====
  function getTotalPoints(): number {
    return getR1Total().points + getR2SkinsForTeam().teamSkins + getR3Total().points
  }

  // ===== SCORECARD TABLE HELPER =====
  function renderNineHoles(holeRange: Hole[], getRoundHoleData: (h: number) => { score: number; points?: number; colorClass: string } | null, showPoints: boolean) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-green-100">
              <th className="text-left px-2 py-1.5 text-xs text-green-600 font-semibold sticky left-0 bg-white">Hole</th>
              {holeRange.map((h) => (
                <th key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 font-semibold text-center min-w-[1.8rem]">{h.hole_number}</th>
              ))}
              <th className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">Tot</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-green-50">
              <td className="px-2 py-1.5 text-xs text-green-600 sticky left-0 bg-white">Par</td>
              {holeRange.map((h) => (
                <td key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 text-center">{h.par}</td>
              ))}
              <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                {holeRange.reduce((s, h) => s + h.par, 0)}
              </td>
            </tr>
            <tr className={showPoints ? "border-b border-green-50" : ""}>
              <td className="px-2 py-1.5 text-xs text-green-600 sticky left-0 bg-white">Score</td>
              {holeRange.map((h) => {
                const data = getRoundHoleData(h.hole_number)
                return (
                  <td key={h.hole_number} className={`px-1 py-1.5 text-xs text-center font-medium ${data ? data.colorClass : "text-gray-300"}`}>
                    {data ? data.score : "–"}
                  </td>
                )
              })}
              <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                {holeRange.reduce((s, h) => { const d = getRoundHoleData(h.hole_number); return s + (d ? d.score : 0) }, 0) || "–"}
              </td>
            </tr>
            {showPoints && (
              <tr>
                <td className="px-2 py-1.5 text-xs text-green-600 sticky left-0 bg-white">Pts</td>
                {holeRange.map((h) => {
                  const data = getRoundHoleData(h.hole_number)
                  return (
                    <td key={h.hole_number} className={`px-1 py-1.5 text-xs text-center font-bold ${
                      data && data.points !== undefined ? (data.points > 0 ? "text-green-700" : data.points < 0 ? "text-red-600" : "text-gray-400") : "text-gray-300"
                    }`}>
                      {data && data.points !== undefined ? data.points : "–"}
                    </td>
                  )
                })}
                <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                  {holeRange.reduce((s, h) => { const d = getRoundHoleData(h.hole_number); return s + (d?.points || 0) }, 0)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading...</p>
      </div>
    )
  }

  if (!selectedTeam) {
    return (
      <div className="flex flex-col flex-1 bg-green-50">
        <div className="flex-1 px-4 py-8">
          <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-green-900 mb-1">Scorecard</h1>
            <p className="text-sm text-green-700 mb-1">{tournamentName}</p>
            <p className="text-sm text-green-600 mb-6">Select a team to view their scorecard.</p>
            <div className="flex flex-col gap-3">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                  className="rounded-xl bg-white border-2 border-green-200 p-4 text-left hover:border-green-500 transition-colors"
                >
                  <h3 className="font-bold text-green-900 text-lg">{team.name}</h3>
                  <p className="text-sm text-green-600 mt-1">{team.players.map((p) => p.name).join(", ")}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
        <BottomNav tournamentId={tournamentId} />
      </div>
    )
  }

  const r1 = getR1Total()
  const r2 = getR2SkinsForTeam()
  const r3 = getR3Total()
  const front9 = holes.filter((h) => h.hole_number <= 9)
  const back9 = holes.filter((h) => h.hole_number > 9)

  return (
    <div className="flex flex-col flex-1 bg-green-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-green-700 text-white px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">Scorecard</p>
            <p className="text-xs text-green-200">{tournamentName}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-sm">{selectedTeam.name}</p>
            <p className="text-xs text-green-200">
              {getTotalPoints()} TOT
            </p>
          </div>
        </div>
      </div>

      {/* Team switcher */}
      <div className="bg-white border-b border-green-200 px-4 py-2">
        <div className="max-w-md mx-auto flex gap-2">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeam(team)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                selectedTeam.id === team.id
                  ? "bg-green-700 text-white"
                  : "bg-green-50 text-green-700 hover:bg-green-100"
              }`}
            >
              {team.name}
            </button>
          ))}
        </div>
      </div>

      {/* Round sections */}
      <div className="flex-1 px-4 py-4">
        <div className="max-w-md mx-auto flex flex-col gap-3">

          {/* ===== ROUND 1: BEST BALL ===== */}
          <div className="rounded-xl bg-white border border-green-200 overflow-hidden">
            <button
              onClick={() => toggleRound(1)}
              className="w-full flex items-center justify-between px-4 py-3 bg-green-700 text-white active:bg-green-800 transition-colors"
            >
              <div className="text-left">
                <p className="font-bold text-sm">R1 &middot; Best Ball</p>
                <p className="text-xs text-green-200">{r1.completed}/18 holes</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">{r1.points} pts</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${expandedRounds[1] ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {expandedRounds[1] && (
              <div>
                {/* Individual player scores */}
                <div className="px-4 py-3 border-b border-green-100">
                  <p className="text-xs font-semibold text-green-600 mb-2">Individual Scores</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-green-100">
                          <th className="text-left px-1 py-1 text-green-600 font-semibold sticky left-0 bg-white min-w-[4rem]"></th>
                          {holes.map((h) => (
                            <th key={h.hole_number} className="px-0.5 py-1 text-green-500 font-medium text-center min-w-[1.5rem]">{h.hole_number}</th>
                          ))}
                          <th className="px-1 py-1 text-green-800 font-bold text-center">Tot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTeam.players.map((player) => {
                          const teamR1 = allScores.filter((s) => s.team_id === selectedTeam.id && s.round_number === 1)
                          let playerTotal = 0
                          let holesPlayed = 0

                          return (
                            <tr key={player.id} className="border-b border-green-50 last:border-0">
                              <td className="px-1 py-1 text-green-700 font-medium sticky left-0 bg-white truncate max-w-[4rem]">
                                {player.name.split(" ")[0]}
                              </td>
                              {holes.map((h) => {
                                const score = teamR1.find((s) => s.hole_number === h.hole_number && s.player_id === player.id)
                                const strokes = score?.strokes || 0
                                if (strokes > 0) { playerTotal += strokes; holesPlayed++ }
                                const diff = strokes - h.par
                                return (
                                  <td key={h.hole_number} className={`px-0.5 py-1 text-center ${
                                    strokes === 0 ? "text-gray-300" :
                                    diff < 0 ? "text-red-600 font-bold" :
                                    diff > 0 ? "text-blue-600" :
                                    "text-green-900"
                                  }`}>
                                    {strokes || "–"}
                                  </td>
                                )
                              })}
                              <td className="px-1 py-1 text-green-800 font-bold text-center">
                                {holesPlayed > 0 ? playerTotal : "–"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Best Ball + Points tables */}
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold text-green-600 mb-1 px-1">Front 9</p>
                  {renderNineHoles(front9, (hNum) => {
                    const data = getR1HoleData(hNum)
                    if (!data) return null
                    const hole = holes.find((h) => h.hole_number === hNum)!
                    return {
                      score: data.bestScore,
                      points: data.points,
                      colorClass: data.bestScore < hole.par ? "text-red-600 font-bold" : data.bestScore > hole.par ? "text-blue-600" : "text-green-900",
                    }
                  }, true)}
                </div>
                <div className="px-3 py-2 border-t border-green-50">
                  <p className="text-xs font-semibold text-green-600 mb-1 px-1">Back 9</p>
                  {renderNineHoles(back9, (hNum) => {
                    const data = getR1HoleData(hNum)
                    if (!data) return null
                    const hole = holes.find((h) => h.hole_number === hNum)!
                    return {
                      score: data.bestScore,
                      points: data.points,
                      colorClass: data.bestScore < hole.par ? "text-red-600 font-bold" : data.bestScore > hole.par ? "text-blue-600" : "text-green-900",
                    }
                  }, true)}
                </div>
              </div>
            )}
          </div>

          {/* ===== ROUND 2: SKINS ===== */}
          <div className="rounded-xl bg-white border border-yellow-300 overflow-hidden">
            <button
              onClick={() => toggleRound(2)}
              className="w-full flex items-center justify-between px-4 py-3 bg-yellow-500 text-white active:bg-yellow-600 transition-colors"
            >
              <div className="text-left">
                <p className="font-bold text-sm">R2 &middot; Skins</p>
                <p className="text-xs text-yellow-100">{r2.completed}/18 holes</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">
                  {r2.teamSkins % 1 === 0 ? r2.teamSkins : r2.teamSkins.toFixed(1)} skins
                </p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${expandedRounds[2] ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {expandedRounds[2] && (
              <div className="px-4 py-3">
                {r2.holeResults.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">No skins results yet</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {r2.holeResults.map((hr) => (
                      <div key={hr.holeNumber} className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        hr.winner ? "bg-green-50" : hr.carryOver > 0 ? "bg-yellow-50" : "bg-gray-50"
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-green-800 w-6">#{hr.holeNumber}</span>
                          {hr.winner ? (
                            <span className="text-xs font-semibold text-green-700">
                              {hr.winner} wins {hr.skinsWon} skin{hr.skinsWon !== 1 ? "s" : ""}
                            </span>
                          ) : hr.carryOver > 0 ? (
                            <span className="text-xs font-medium text-yellow-700">
                              Tie — {hr.carryOver} carry over
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-blue-700">
                              Split — {hr.skinsWon} skin{hr.skinsWon !== 1 ? "s" : ""} divided
                            </span>
                          )}
                        </div>
                        {hr.winner && (
                          <span className="text-xs font-bold text-green-600">+{hr.skinsWon}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ===== ROUND 3: SCRAMBLE ===== */}
          <div className="rounded-xl bg-white border border-green-200 overflow-hidden">
            <button
              onClick={() => toggleRound(3)}
              className="w-full flex items-center justify-between px-4 py-3 bg-green-700 text-white active:bg-green-800 transition-colors"
            >
              <div className="text-left">
                <p className="font-bold text-sm">R3 &middot; Scramble</p>
                <p className="text-xs text-green-200">{r3.completed}/18 holes</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">{r3.points} pts</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${expandedRounds[3] ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {expandedRounds[3] && (
              <div>
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold text-green-600 mb-1 px-1">Front 9</p>
                  {renderNineHoles(front9, (hNum) => {
                    const data = getR3HoleData(hNum)
                    if (!data) return null
                    const hole = holes.find((h) => h.hole_number === hNum)!
                    return {
                      score: data.strokes,
                      points: data.points,
                      colorClass: data.strokes < hole.par ? "text-red-600 font-bold" : data.strokes > hole.par ? "text-blue-600" : "text-green-900",
                    }
                  }, true)}
                </div>
                <div className="px-3 py-2 border-t border-green-50">
                  <p className="text-xs font-semibold text-green-600 mb-1 px-1">Back 9</p>
                  {renderNineHoles(back9, (hNum) => {
                    const data = getR3HoleData(hNum)
                    if (!data) return null
                    const hole = holes.find((h) => h.hole_number === hNum)!
                    return {
                      score: data.strokes,
                      points: data.points,
                      colorClass: data.strokes < hole.par ? "text-red-600 font-bold" : data.strokes > hole.par ? "text-blue-600" : "text-green-900",
                    }
                  }, true)}
                </div>
              </div>
            )}
          </div>

          {/* Total summary */}
          <div className="rounded-xl bg-green-900 text-white p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Tournament Total</p>
              <p className="text-xs text-green-300">
                R1: {r1.points} &middot; R2: {r2.teamSkins % 1 === 0 ? r2.teamSkins : r2.teamSkins.toFixed(1)} &middot; R3: {r3.points}
              </p>
            </div>
            <p className="text-3xl font-bold">{getTotalPoints()}</p>
          </div>

        </div>
      </div>

      <BottomNav tournamentId={tournamentId} teamId={selectedTeam?.id} roundNumber={roundNumber} />
    </div>
  )
}
