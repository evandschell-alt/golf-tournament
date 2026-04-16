"use client"

import { useState, useEffect, use } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { round1HolePoints } from "@/lib/scoring"
import BottomNav from "@/components/BottomNav"

type Player = { id: string; name: string; sort_order: number }
type Team = { id: string; name: string; players: Player[] }
type Hole = { hole_number: number; par: number }

type HoleScores = {
  [playerId: string]: {
    strokes: number
    moneyball_used: boolean
    moneyball_lost: boolean
  }
}

export default function ScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params)
  const searchParams = useSearchParams()
  const teamIdFromUrl = searchParams.get("team")
  const roundFromUrl = searchParams.get("round")

  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [holes, setHoles] = useState<Hole[]>([])
  const [scores, setScores] = useState<{ [holeNumber: number]: HoleScores }>({})
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
  const [teeBox, setTeeBox] = useState<string>("white")

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

      const { data: roundSettings } = await supabase
        .from("round_settings")
        .select("tee_box")
        .eq("tournament_id", tournamentId)
        .eq("round_number", roundNumber)
        .single()

      if (roundSettings?.tee_box) setTeeBox(roundSettings.tee_box)

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
      }

      setLoading(false)
    }

    fetchData()
  }, [tournamentId, roundNumber, teamIdFromUrl])

  // Load scores when team is selected
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
        existingScores.forEach((s) => {
          if (!loaded[s.hole_number]) loaded[s.hole_number] = {}
          if (s.player_id) {
            loaded[s.hole_number][s.player_id] = {
              strokes: s.strokes,
              moneyball_used: s.moneyball_used,
              moneyball_lost: s.moneyball_lost,
            }
          }
        })
        setScores(loaded)
      } else {
        setScores({})
      }
    }

    loadScores()
  }, [selectedTeam, tournamentId, roundNumber])

  function getScorecardHole(holeNumber: number): { bestScore: number; points: number } | null {
    const hs = scores[holeNumber]
    if (!hs || !selectedTeam) return null
    const players = selectedTeam.players
    const allEntered = players.every((p) => hs[p.id]?.strokes > 0)
    if (!allEntered) return null

    const playerData = players.map((p) => ({
      strokes: hs[p.id].strokes,
      moneyball_used: hs[p.id].moneyball_used,
      moneyball_lost: hs[p.id].moneyball_lost,
    }))
    const hole = holes.find((h) => h.hole_number === holeNumber)
    if (!hole) return null
    const result = round1HolePoints(playerData, hole.par)
    return { bestScore: result.bestScore, points: result.points }
  }

  function getTotalPoints(): number {
    let total = 0
    holes.forEach((hole) => {
      const data = getScorecardHole(hole.hole_number)
      if (data) total += data.points
    })
    return total
  }

  function getCompletedHoles(): number {
    let count = 0
    holes.forEach((hole) => {
      if (getScorecardHole(hole.hole_number)) count++
    })
    return count
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading...</p>
      </div>
    )
  }

  // Team selection
  if (!selectedTeam) {
    return (
      <div className="flex flex-col flex-1 bg-green-50">
        <div className="flex-1 px-4 py-8">
          <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-green-900 mb-1">Scorecard</h1>
            <p className="text-sm text-green-700 mb-1">{tournamentName} &middot; Round {roundNumber}</p>
            <p className="text-sm text-green-600 mb-6">Select a team to view their scorecard.</p>

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

  return (
    <div className="flex flex-col flex-1 bg-green-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-green-700 text-white px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">Round {roundNumber} &middot; {roundNumber === 1 ? "Best Ball" : roundNumber === 2 ? "Skins" : "Scramble"}</p>
            <p className="text-xs text-green-200 capitalize">{teeBox} Tees</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-sm">{selectedTeam.name}</p>
            <p className="text-xs text-green-200">
              {getTotalPoints()} RD &middot; {getTotalPoints()} TOT
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

      {/* Scorecard tables */}
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

      <BottomNav tournamentId={tournamentId} teamId={selectedTeam?.id} roundNumber={roundNumber} />
    </div>
  )
}
