"use client"

import { useState, useEffect, useRef, use } from "react"
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

  // Which nine is visible per round (front or back)
  const [activeNine, setActiveNine] = useState<{ [r: number]: "front" | "back" }>({
    1: "front",
    2: "front",
    3: "front",
  })
  // Which R2 groups are expanded
  const [expandedGroups, setExpandedGroups] = useState<{ [g: number]: boolean }>({})
  const touchStartX = useRef(0)

  function toggleRound(r: number) {
    setExpandedRounds((prev) => ({ ...prev, [r]: !prev[r] }))
  }

  function toggleGroup(g: number) {
    setExpandedGroups((prev) => ({ ...prev, [g]: !prev[g] }))
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(round: number, e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      setActiveNine((prev) => ({
        ...prev,
        [round]: diff > 0 ? "back" : "front",
      }))
    }
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

  // ===== R2 FOURSOME DATA (for card layout) =====
  function getR2Foursomes(): {
    groupNumber: number
    players: { id: string; name: string; teamId: string }[]
    completed: number
    teamSkinsInGroup: number
    holeResults: { [holeNumber: number]: { winner: { playerId: string; teamId: string } | null; skinsWon: number; carryOver: number } }
  }[] {
    if (!selectedTeam) return []

    const teamPlayerIds = selectedTeam.players.map((p) => p.id)
    const foursomeGroups: { [g: number]: string[] } = {}
    r2Pairings.forEach((p) => {
      if (!foursomeGroups[p.group_number]) foursomeGroups[p.group_number] = []
      foursomeGroups[p.group_number].push(p.player_id)
    })

    const r2Scores = allScores.filter((s) => s.round_number === 2)
    const results: ReturnType<typeof getR2Foursomes> = []

    Object.entries(foursomeGroups).forEach(([gNum, playerIds]) => {
      const hasTeamPlayer = playerIds.some((pid) => teamPlayerIds.includes(pid))
      if (!hasTeamPlayer) return

      const players = playerIds.map((pid) => {
        const player = allPlayers.find((p) => p.id === pid)
        return { id: pid, name: player?.name || "Unknown", teamId: player?.team_id || "" }
      })

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

      const skinsResult = foursomeHoles.length > 0
        ? calculateSkins(foursomeHoles)
        : { holeResults: [], teamSkins: {} as { [k: string]: number }, playerSkins: {}, currentCarryOver: 0 }

      const holeResultsMap: (typeof results)[0]["holeResults"] = {}
      skinsResult.holeResults.forEach((hr) => {
        holeResultsMap[hr.holeNumber] = { winner: hr.winner, skinsWon: hr.skinsWon, carryOver: hr.carryOver }
      })

      results.push({
        groupNumber: parseInt(gNum),
        players,
        completed: foursomeHoles.length,
        teamSkinsInGroup: skinsResult.teamSkins[selectedTeam!.id] || 0,
        holeResults: holeResultsMap,
      })
    })

    return results.sort((a, b) => a.groupNumber - b.groupNumber)
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

  // ===== SCORECARD TABLE HELPERS =====
  function renderScoreCell(strokes: number, par: number) {
    const diff = strokes - par
    if (diff <= -2) {
      // Eagle or better: double circle
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-green-800 outline outline-1 outline-green-800 outline-offset-1 text-green-900 font-bold text-xs">
          {strokes}
        </span>
      )
    }
    if (diff === -1) {
      // Birdie: single circle
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-green-800 text-green-900 font-bold text-xs">
          {strokes}
        </span>
      )
    }
    if (diff === 1) {
      // Bogey: single square
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 border border-green-800 text-green-900 text-xs">
          {strokes}
        </span>
      )
    }
    if (diff >= 2) {
      // Double bogey or worse: double square
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 border border-green-800 outline outline-1 outline-green-800 outline-offset-1 text-green-900 text-xs">
          {strokes}
        </span>
      )
    }
    // Par: plain
    return <span className="text-green-900 text-xs">{strokes}</span>
  }

  function renderNineTable(
    holeRange: Hole[],
    playerRows: { name: string; getData: (hNum: number) => number | null }[],
    getPoints: (hNum: number) => number | null,
    pointsLabel: string
  ) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-green-50">
              <th className="text-left px-2 py-1.5 text-xs text-green-600 font-semibold sticky left-0 bg-green-50 min-w-[3.5rem]">Hole</th>
              {holeRange.map((h) => (
                <th key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 font-semibold text-center min-w-[1.8rem]">{h.hole_number}</th>
              ))}
              <th className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">Tot</th>
            </tr>
          </thead>
          <tbody>
            {/* Par row */}
            <tr className="bg-green-50 border-b-2 border-green-200">
              <td className="px-2 py-1.5 text-xs text-green-600 font-medium sticky left-0 bg-green-50">Par</td>
              {holeRange.map((h) => (
                <td key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 text-center">{h.par}</td>
              ))}
              <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                {holeRange.reduce((s, h) => s + h.par, 0)}
              </td>
            </tr>
            {/* Player score rows */}
            {playerRows.map((player, i) => {
              let total = 0
              let count = 0
              return (
                <tr key={i} className={i < playerRows.length - 1 ? "border-b border-green-50" : "border-b-2 border-green-200"}>
                  <td className="px-2 py-2 text-xs text-green-800 font-semibold sticky left-0 bg-white truncate max-w-[3.5rem]">
                    {player.name}
                  </td>
                  {holeRange.map((h) => {
                    const strokes = player.getData(h.hole_number)
                    if (strokes && strokes > 0) { total += strokes; count++ }
                    return (
                      <td key={h.hole_number} className="px-1 py-2 text-center">
                        {strokes ? renderScoreCell(strokes, h.par) : <span className="text-gray-300 text-xs">–</span>}
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-xs text-green-800 font-bold text-center">
                    {count > 0 ? total : "–"}
                  </td>
                </tr>
              )
            })}
            {/* Points row */}
            <tr className="bg-green-100">
              <td className="px-2 py-2 text-xs text-green-800 font-bold sticky left-0 bg-green-100">{pointsLabel}</td>
              {holeRange.map((h) => {
                const pts = getPoints(h.hole_number)
                return (
                  <td key={h.hole_number} className={`px-1 py-2 text-xs text-center font-bold ${
                    pts !== null ? (pts > 0 ? "text-green-800" : pts < 0 ? "text-red-600" : "text-gray-400") : "text-gray-300"
                  }`}>
                    {pts !== null ? pts : "–"}
                  </td>
                )
              })}
              <td className="px-2 py-2 text-xs text-green-900 font-bold text-center">
                {holeRange.reduce((s, h) => s + (getPoints(h.hole_number) || 0), 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  function renderSwipeableNines(
    round: number,
    playerRows: { name: string; getData: (hNum: number) => number | null }[],
    getPoints: (hNum: number) => number | null,
    pointsLabel: string
  ) {
    const nine = activeNine[round] || "front"
    return (
      <div>
        {/* Front 9 / Back 9 indicator */}
        <div className="flex items-center justify-center gap-3 pt-3 pb-1">
          <div className={`w-2 h-2 rounded-full transition-colors ${nine === "front" ? "bg-green-700" : "bg-green-300"}`} />
          <p className="text-xs font-semibold text-green-600">
            {nine === "front" ? "Front 9" : "Back 9"}
          </p>
          <div className={`w-2 h-2 rounded-full transition-colors ${nine === "back" ? "bg-green-700" : "bg-green-300"}`} />
        </div>
        {/* Swipeable container */}
        <div
          className="overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={(e) => handleTouchEnd(round, e)}
        >
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: nine === "back" ? "translateX(-100%)" : "translateX(0)" }}
          >
            <div className="w-full flex-shrink-0 px-3 py-2">
              {renderNineTable(front9, playerRows, getPoints, pointsLabel)}
            </div>
            <div className="w-full flex-shrink-0 px-3 py-2">
              {renderNineTable(back9, playerRows, getPoints, pointsLabel)}
            </div>
          </div>
        </div>
        {/* Swipe hint */}
        <p className="text-center text-[10px] text-green-400 pb-2">
          Swipe {nine === "front" ? "left for back 9" : "right for front 9"}
        </p>
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
              className="w-full flex items-center justify-between px-4 py-3 bg-green-500 text-white active:bg-green-600 transition-colors"
            >
              <div className="text-left">
                <p className="font-bold text-sm">R1 &middot; Best Ball</p>
                <p className="text-xs text-green-100">{r1.completed}/18 holes</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">{r1.points} pts</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${expandedRounds[1] ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {expandedRounds[1] && renderSwipeableNines(
              1,
              selectedTeam.players.map((player) => ({
                name: player.name.split(" ")[0],
                getData: (hNum: number) => {
                  const teamR1 = allScores.filter((s) => s.team_id === selectedTeam!.id && s.round_number === 1)
                  const score = teamR1.find((s) => s.hole_number === hNum && s.player_id === player.id)
                  return score?.strokes || null
                },
              })),
              (hNum) => {
                const data = getR1HoleData(hNum)
                return data ? data.points : null
              },
              "Pts"
            )}
          </div>

          {/* ===== ROUND 2: SKINS ===== */}
          <div className="rounded-xl bg-white border border-green-300 overflow-hidden">
            <button
              onClick={() => toggleRound(2)}
              className="w-full flex items-center justify-between px-4 py-3 bg-green-700 text-white active:bg-green-800 transition-colors"
            >
              <div className="text-left">
                <p className="font-bold text-sm">R2 &middot; Skins</p>
                <p className="text-xs text-green-200">{r2.completed}/18 holes</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">
                  {r2.teamSkins % 1 === 0 ? r2.teamSkins : r2.teamSkins.toFixed(1)} pts
                </p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${expandedRounds[2] ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {expandedRounds[2] && (() => {
              const foursomes = getR2Foursomes()
              const r2AllScores = allScores.filter((s) => s.round_number === 2)

              if (foursomes.length === 0) {
                return <div className="px-4 py-3"><p className="text-sm text-gray-400 text-center py-2">No skins results yet</p></div>
              }

              function renderR2Table(holeRange: Hole[], foursome: (typeof foursomes)[0]) {
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-green-50">
                          <th className="text-left px-2 py-1.5 text-xs text-green-600 font-semibold sticky left-0 bg-green-50 min-w-[3.5rem]">Hole</th>
                          {holeRange.map((h) => (
                            <th key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 font-semibold text-center min-w-[1.8rem]">{h.hole_number}</th>
                          ))}
                          <th className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">Tot</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-green-50 border-b-2 border-green-200">
                          <td className="px-2 py-1.5 text-xs text-green-600 font-medium sticky left-0 bg-green-50">Par</td>
                          {holeRange.map((h) => (
                            <td key={h.hole_number} className="px-1 py-1.5 text-xs text-green-600 text-center">{h.par}</td>
                          ))}
                          <td className="px-2 py-1.5 text-xs text-green-800 font-bold text-center">
                            {holeRange.reduce((s, h) => s + h.par, 0)}
                          </td>
                        </tr>
                        {foursome.players.map((player, i) => {
                          let total = 0
                          let count = 0
                          const isTeamPlayer = selectedTeam!.players.some((p) => p.id === player.id)
                          return (
                            <tr key={player.id} className={i < foursome.players.length - 1 ? "border-b border-green-50" : "border-b-2 border-green-200"}>
                              <td className={`px-2 py-2 text-xs font-semibold sticky left-0 bg-white truncate max-w-[3.5rem] ${isTeamPlayer ? "text-green-800" : "text-gray-400"}`}>
                                {player.name.split(" ")[0]}
                              </td>
                              {holeRange.map((h) => {
                                const score = r2AllScores.find((s) => s.player_id === player.id && s.hole_number === h.hole_number)
                                const strokes = score?.strokes || 0
                                if (strokes > 0) { total += strokes; count++ }
                                return (
                                  <td key={h.hole_number} className="px-1 py-2 text-center">
                                    {strokes > 0 ? renderScoreCell(strokes, h.par) : <span className="text-gray-300 text-xs">–</span>}
                                  </td>
                                )
                              })}
                              <td className="px-2 py-2 text-xs text-green-800 font-bold text-center">
                                {count > 0 ? total : "–"}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="bg-green-100">
                          <td className="px-2 py-2 text-xs text-green-800 font-bold sticky left-0 bg-green-100">Skins</td>
                          {holeRange.map((h) => {
                            const result = foursome.holeResults[h.hole_number]
                            if (!result) {
                              return <td key={h.hole_number} className="px-1 py-2 text-xs text-center text-gray-300">–</td>
                            }
                            if (result.winner) {
                              const isOurTeam = result.winner.teamId === selectedTeam!.id
                              const winnerTeam = teams.find((t) => t.id === result.winner!.teamId)
                              const teamInitial = winnerTeam?.name?.charAt(0) || "?"
                              return (
                                <td key={h.hole_number} className={`px-1 py-2 text-xs text-center font-bold ${isOurTeam ? "text-green-700" : "text-gray-400"}`}>
                                  {isOurTeam ? result.skinsWon : teamInitial}
                                </td>
                              )
                            }
                            return (
                              <td key={h.hole_number} className="px-1 py-2 text-xs text-center text-green-500 font-medium">
                                —
                              </td>
                            )
                          })}
                          <td className="px-2 py-2 text-xs text-green-900 font-bold text-center">
                            {foursome.teamSkinsInGroup % 1 === 0 ? foursome.teamSkinsInGroup : foursome.teamSkinsInGroup.toFixed(1)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )
              }

              return (
                <div className="flex flex-col gap-1 py-2 px-3">
                  {foursomes.map((f) => {
                    const gKey = f.groupNumber
                    const nine = activeNine[20 + gKey] || "front"
                    const teamPlayerNames = f.players
                      .filter((p) => selectedTeam!.players.some((tp) => tp.id === p.id))
                      .map((p) => p.name.split(" ")[0])
                      .join(", ")

                    return (
                      <div key={gKey} className="rounded-lg border border-green-200 overflow-hidden bg-white">
                        <button
                          onClick={() => toggleGroup(gKey)}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-green-50 active:bg-green-100 transition-colors"
                        >
                          <div className="text-left">
                            <p className="font-semibold text-sm text-green-800">Group {gKey}</p>
                            <p className="text-xs text-green-600">{teamPlayerNames}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-green-800">
                              {f.teamSkinsInGroup % 1 === 0 ? f.teamSkinsInGroup : f.teamSkinsInGroup.toFixed(1)} skins
                            </p>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-green-600 transition-transform ${expandedGroups[gKey] ? "rotate-180" : ""}`}>
                              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </button>

                        {expandedGroups[gKey] && (
                          <div>
                            <div className="flex items-center justify-center gap-3 pt-2 pb-1">
                              <div className={`w-2 h-2 rounded-full transition-colors ${nine === "front" ? "bg-green-700" : "bg-green-300"}`} />
                              <p className="text-xs font-semibold text-green-600">
                                {nine === "front" ? "Front 9" : "Back 9"}
                              </p>
                              <div className={`w-2 h-2 rounded-full transition-colors ${nine === "back" ? "bg-green-700" : "bg-green-300"}`} />
                            </div>
                            <div
                              className="overflow-hidden"
                              onTouchStart={handleTouchStart}
                              onTouchEnd={(e) => handleTouchEnd(20 + gKey, e)}
                            >
                              <div
                                className="flex transition-transform duration-300 ease-out"
                                style={{ transform: nine === "back" ? "translateX(-100%)" : "translateX(0)" }}
                              >
                                <div className="w-full flex-shrink-0 px-3 py-2">
                                  {renderR2Table(front9, f)}
                                </div>
                                <div className="w-full flex-shrink-0 px-3 py-2">
                                  {renderR2Table(back9, f)}
                                </div>
                              </div>
                            </div>
                            <p className="text-center text-[10px] text-green-400 pb-2">
                              Swipe {nine === "front" ? "left for back 9" : "right for front 9"}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* ===== ROUND 3: SCRAMBLE ===== */}
          <div className="rounded-xl bg-white border border-green-400 overflow-hidden">
            <button
              onClick={() => toggleRound(3)}
              className="w-full flex items-center justify-between px-4 py-3 bg-green-800 text-white active:bg-green-900 transition-colors"
            >
              <div className="text-left">
                <p className="font-bold text-sm">R3 &middot; Scramble</p>
                <p className="text-xs text-green-300">{r3.completed}/18 holes</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">{r3.points} pts</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${expandedRounds[3] ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {expandedRounds[3] && renderSwipeableNines(
              3,
              [{
                name: "Score",
                getData: (hNum: number) => {
                  const data = getR3HoleData(hNum)
                  return data?.strokes || null
                },
              }],
              (hNum) => {
                const data = getR3HoleData(hNum)
                return data ? data.points : null
              },
              "Pts"
            )}
          </div>

        </div>
      </div>

      <BottomNav tournamentId={tournamentId} teamId={selectedTeam?.id} roundNumber={roundNumber} />
    </div>
  )
}
