"use client"

import { useState, useEffect, useCallback, use } from "react"
import { supabase } from "@/lib/supabase"
import { round1HolePoints } from "@/lib/scoring"
import BottomNav from "@/components/BottomNav"

type Team = { id: string; name: string; sort_order: number }
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

type TeamStanding = {
  team: Team
  round1Points: number
  round1Completed: number
  totalPoints: number
}

export default function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params)
  const [standings, setStandings] = useState<TeamStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [tournamentName, setTournamentName] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Store raw data for recalculation
  const [teams, setTeams] = useState<Team[]>([])
  const [holes, setHoles] = useState<Hole[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])

  const calculateStandings = useCallback(
    (teamsData: Team[], holesData: Hole[], scoresData: ScoreRow[]): TeamStanding[] => {
      return teamsData
        .map((team) => {
          // Round 1: Best Ball Stableford
          let round1Points = 0
          let round1Completed = 0
          const teamR1Scores = scoresData.filter(
            (s) => s.team_id === team.id && s.round_number === 1
          )

          // Get unique player IDs for this team in round 1
          const playerIds = [...new Set(teamR1Scores.filter((s) => s.player_id).map((s) => s.player_id!))]

          holesData.forEach((hole) => {
            // Get all player scores for this hole
            const holePlayerScores = playerIds.map((pid) =>
              teamR1Scores.find((s) => s.hole_number === hole.hole_number && s.player_id === pid)
            )

            // Only count if all players have scores
            if (holePlayerScores.every((s) => s && s.strokes > 0) && holePlayerScores.length >= 4) {
              const playerData = holePlayerScores.map((s) => ({
                strokes: s!.strokes,
                moneyball_used: s!.moneyball_used,
                moneyball_lost: s!.moneyball_lost,
              }))
              round1Points += round1HolePoints(playerData, hole.par).points
              round1Completed++
            }
          })

          // Rounds 2 & 3 will be added later
          const totalPoints = round1Points

          return { team, round1Points, round1Completed, totalPoints }
        })
        .sort((a, b) => b.totalPoints - a.totalPoints)
    },
    []
  )

  useEffect(() => {
    const fetchData = async () => {
      // Tournament info
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("name, year, course_id")
        .eq("id", tournamentId)
        .single()

      if (!tournament) return

      setTournamentName(`${tournament.name} ${tournament.year}`)

      // Fetch holes
      let holesData: Hole[] = []
      if (tournament.course_id) {
        const { data } = await supabase
          .from("holes")
          .select("hole_number, par")
          .eq("course_id", tournament.course_id)
          .order("hole_number")
        holesData = data || []
      }

      // Fetch teams
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name, sort_order")
        .eq("tournament_id", tournamentId)
        .order("sort_order")

      // Fetch all scores
      const { data: scoresData } = await supabase
        .from("scores")
        .select("team_id, player_id, round_number, hole_number, strokes, moneyball_used, moneyball_lost")
        .eq("tournament_id", tournamentId)

      const t = teamsData || []
      const h = holesData
      const s = scoresData || []

      setTeams(t)
      setHoles(h)
      setScores(s)
      setStandings(calculateStandings(t, h, s))
      setLastUpdated(new Date())
      setLoading(false)
    }

    fetchData()
  }, [tournamentId, calculateStandings])

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`leaderboard-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scores",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          // Refetch all scores on any change
          const refetch = async () => {
            const { data: scoresData } = await supabase
              .from("scores")
              .select("team_id, player_id, round_number, hole_number, strokes, moneyball_used, moneyball_lost")
              .eq("tournament_id", tournamentId)

            const s = scoresData || []
            setScores(s)
            setStandings(calculateStandings(teams, holes, s))
            setLastUpdated(new Date())
          }
          refetch()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tournamentId, teams, holes, calculateStandings])

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading leaderboard...</p>
      </div>
    )
  }

  const leader = standings[0]
  const hasScores = scores.length > 0

  return (
    <div className="flex flex-col flex-1 bg-green-50">
      <div className="flex-1 px-4 py-6">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-green-900">Leaderboard</h1>
          <p className="text-sm text-green-700 mt-1">{tournamentName}</p>
          {lastUpdated && (
            <p className="text-xs text-green-500 mt-1">
              Live &middot; Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {!hasScores ? (
          <div className="rounded-xl bg-white border border-green-200 p-8 text-center">
            <p className="text-green-600">No scores entered yet.</p>
            <p className="text-sm text-green-500 mt-1">Scores will appear here in real time once a captain starts entering them.</p>
          </div>
        ) : (
          <>
            {/* Standings cards */}
            <div className="flex flex-col gap-3">
              {standings.map((standing, index) => {
                const isLeader = index === 0 && standing.totalPoints > 0
                const isTied = index > 0 && standing.totalPoints === leader?.totalPoints && standing.totalPoints > 0

                return (
                  <div
                    key={standing.team.id}
                    className={`rounded-xl bg-white border-2 p-4 transition-all ${
                      isLeader
                        ? "border-yellow-400 shadow-md"
                        : isTied
                        ? "border-yellow-300"
                        : "border-green-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-lg font-bold w-8 h-8 rounded-full flex items-center justify-center ${
                            isLeader || isTied
                              ? "bg-yellow-400 text-yellow-900"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <h3 className="font-bold text-green-900 text-lg">{standing.team.name}</h3>
                      </div>
                      <div className="text-right">
                        <p className={`text-3xl font-bold ${isLeader || isTied ? "text-yellow-600" : "text-green-700"}`}>
                          {standing.totalPoints}
                        </p>
                        <p className="text-xs text-green-500">points</p>
                      </div>
                    </div>

                    {/* Round breakdown */}
                    <div className="flex gap-2">
                      <div className={`flex-1 rounded-lg px-3 py-2 ${
                        standing.round1Completed > 0 ? "bg-green-50" : "bg-gray-50"
                      }`}>
                        <p className="text-xs text-green-600 font-semibold">R1 Best Ball</p>
                        <p className="text-sm font-bold text-green-900">
                          {standing.round1Points} pts
                        </p>
                        <p className="text-xs text-green-500">
                          {standing.round1Completed}/18 holes
                        </p>
                      </div>
                      <div className="flex-1 rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-400 font-semibold">R2 Skins</p>
                        <p className="text-sm font-bold text-gray-300">–</p>
                        <p className="text-xs text-gray-300">upcoming</p>
                      </div>
                      <div className="flex-1 rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-400 font-semibold">R3 Scramble</p>
                        <p className="text-sm font-bold text-gray-300">–</p>
                        <p className="text-xs text-gray-300">upcoming</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Scoring key */}
            <div className="mt-6 rounded-xl bg-white border border-green-200 p-4">
              <h4 className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Stableford Scoring</h4>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div>
                  <p className="font-bold text-green-900">8</p>
                  <p className="text-green-500">Albatross</p>
                </div>
                <div>
                  <p className="font-bold text-green-900">4</p>
                  <p className="text-green-500">Eagle</p>
                </div>
                <div>
                  <p className="font-bold text-green-900">2</p>
                  <p className="text-green-500">Birdie</p>
                </div>
                <div>
                  <p className="font-bold text-green-900">1</p>
                  <p className="text-green-500">Par</p>
                </div>
                <div>
                  <p className="font-bold text-green-900">0</p>
                  <p className="text-green-500">Bogey+</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      <BottomNav tournamentId={tournamentId} />
    </div>
  )
}
