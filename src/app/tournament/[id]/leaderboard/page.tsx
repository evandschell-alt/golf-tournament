"use client"

import { useState, useEffect, useCallback, use } from "react"
import { supabase } from "@/lib/supabase"
import { round1HolePoints, calculateSkins, adjustedStablefordPoints } from "@/lib/scoring"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"

type Team = { id: string; name: string; sort_order: number }
type Player = { id: string; name: string; team_id: string }
type Hole = { hole_number: number; par: number }
type R2Pairing = { group_number: number; player_id: string }
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
  round2Skins: number
  round2Completed: number
  round3Points: number
  round3Completed: number
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
  const [players, setPlayers] = useState<Player[]>([])
  const [holes, setHoles] = useState<Hole[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [r2Pairings, setR2Pairings] = useState<R2Pairing[]>([])

  const calculateStandings = useCallback(
    (
      teamsData: Team[],
      playersData: Player[],
      holesData: Hole[],
      scoresData: ScoreRow[],
      pairingsData: R2Pairing[]
    ): TeamStanding[] => {
      // ---- ROUND 2: SKINS (calculated once for all foursomes) ----
      // Group pairings by group_number
      const foursomeGroups: { [groupNum: number]: string[] } = {}
      pairingsData.forEach((p) => {
        if (!foursomeGroups[p.group_number]) foursomeGroups[p.group_number] = []
        foursomeGroups[p.group_number].push(p.player_id)
      })

      // Calculate skins per team across all foursomes
      const teamSkinsMap: { [teamId: string]: number } = {}
      const teamR2CompletedMap: { [teamId: string]: number } = {}
      teamsData.forEach((t) => {
        teamSkinsMap[t.id] = 0
        teamR2CompletedMap[t.id] = 0
      })

      const r2Scores = scoresData.filter((s) => s.round_number === 2)

      Object.entries(foursomeGroups).forEach(([, playerIds]) => {
        // Build hole data for this foursome
        const foursomeHoles: { holeNumber: number; players: { playerId: string; teamId: string; strokes: number }[] }[] = []

        holesData.forEach((hole) => {
          const holePlayers = playerIds.map((pid) => {
            const score = r2Scores.find((s) => s.player_id === pid && s.hole_number === hole.hole_number)
            const player = playersData.find((p) => p.id === pid)
            return {
              playerId: pid,
              teamId: player?.team_id || "",
              strokes: score?.strokes || 0,
            }
          })

          // Only include hole if all players have scores
          const allEntered = holePlayers.every((p) => p.strokes > 0)
          if (allEntered) {
            foursomeHoles.push({ holeNumber: hole.hole_number, players: holePlayers })
          }
        })

        if (foursomeHoles.length > 0) {
          const skinsResult = calculateSkins(foursomeHoles)

          // Add skins to team totals
          Object.entries(skinsResult.teamSkins).forEach(([teamId, skins]) => {
            teamSkinsMap[teamId] = (teamSkinsMap[teamId] || 0) + skins
          })

          // Track completed holes per team (use max completed across foursomes)
          playerIds.forEach((pid) => {
            const player = playersData.find((p) => p.id === pid)
            if (player) {
              const current = teamR2CompletedMap[player.team_id] || 0
              teamR2CompletedMap[player.team_id] = Math.max(current, foursomeHoles.length)
            }
          })
        }
      })

      return teamsData
        .map((team) => {
          // ---- ROUND 1: BEST BALL STABLEFORD ----
          let round1Points = 0
          let round1Completed = 0
          const teamR1Scores = scoresData.filter(
            (s) => s.team_id === team.id && s.round_number === 1
          )

          const playerIds = [...new Set(teamR1Scores.filter((s) => s.player_id).map((s) => s.player_id!))]

          holesData.forEach((hole) => {
            const holePlayerScores = playerIds.map((pid) =>
              teamR1Scores.find((s) => s.hole_number === hole.hole_number && s.player_id === pid)
            )

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

          // ---- ROUND 2: SKINS (from pre-calculated map) ----
          const round2Skins = teamSkinsMap[team.id] || 0
          const round2Completed = teamR2CompletedMap[team.id] || 0

          // ---- ROUND 3: SCRAMBLE (ADJUSTED STABLEFORD) ----
          let round3Points = 0
          let round3Completed = 0
          const teamR3Scores = scoresData.filter(
            (s) => s.team_id === team.id && s.round_number === 3
          )

          // For scramble, all players have the same strokes per hole
          // Just need one score per hole
          const r3HoleScores: { [holeNum: number]: number } = {}
          teamR3Scores.forEach((s) => {
            if (s.strokes > 0) {
              r3HoleScores[s.hole_number] = s.strokes
            }
          })

          holesData.forEach((hole) => {
            const strokes = r3HoleScores[hole.hole_number]
            if (strokes && strokes > 0) {
              round3Points += adjustedStablefordPoints(strokes, hole.par)
              round3Completed++
            }
          })

          // ---- TOTAL ----
          const totalPoints = round1Points + round2Skins + round3Points

          return {
            team,
            round1Points,
            round1Completed,
            round2Skins,
            round2Completed,
            round3Points,
            round3Completed,
            totalPoints,
          }
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

      // Fetch players (needed for R2 skins team mapping)
      const { data: playersData } = await supabase
        .from("players")
        .select("id, name, team_id")
        .in("team_id", (teamsData || []).map((t) => t.id))

      // Fetch R2 pairings
      const { data: pairingsData } = await supabase
        .from("r2_pairings")
        .select("group_number, player_id")
        .eq("tournament_id", tournamentId)

      // Fetch all scores
      const { data: scoresData } = await supabase
        .from("scores")
        .select("team_id, player_id, round_number, hole_number, strokes, moneyball_used, moneyball_lost")
        .eq("tournament_id", tournamentId)

      const t = teamsData || []
      const pl = playersData || []
      const h = holesData
      const s = scoresData || []
      const p = pairingsData || []

      setTeams(t)
      setPlayers(pl)
      setHoles(h)
      setScores(s)
      setR2Pairings(p)
      setStandings(calculateStandings(t, pl, h, s, p))
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
            setStandings(calculateStandings(teams, players, holes, s, r2Pairings))
            setLastUpdated(new Date())
          }
          refetch()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tournamentId, teams, players, holes, r2Pairings, calculateStandings])

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading leaderboard...</p>
      </div>
    )
  }

  const leader = standings[0]

  return (
    <div className="flex flex-col flex-1 bg-green-50">
      <div className="flex-1 px-4 py-6">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 relative">
          <Link
            href={`/tournament/${tournamentId}/settings`}
            className="absolute right-0 top-1 text-green-400 hover:text-green-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="text-3xl font-bold text-green-900">Leaderboard</h1>
          <p className="text-sm text-green-700 mt-1">{tournamentName}</p>
          {lastUpdated && (
            <p className="text-xs text-green-500 mt-1">
              Live &middot; Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
          <p className="text-xs text-green-400 mt-2">Tap a team to enter scores</p>
        </div>

        {standings.length === 0 ? (
          <div className="rounded-xl bg-white border border-green-200 p-8 text-center">
            <p className="text-green-600">No teams set up yet.</p>
            <p className="text-sm text-green-500 mt-1">Add teams in settings to get started.</p>
          </div>
        ) : (
          <>
            {/* Standings cards */}
            <div className="flex flex-col gap-3">
              {standings.map((standing, index) => {
                const isLeader = index === 0 && standing.totalPoints > 0
                const isTied = index > 0 && standing.totalPoints === leader?.totalPoints && standing.totalPoints > 0

                return (
                  <Link
                    key={standing.team.id}
                    href={`/tournament/${tournamentId}/score?team=${standing.team.id}`}
                    className={`block rounded-xl bg-white border-2 p-4 transition-all hover:shadow-md ${
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

                    {/* Round breakdown — shades match the scorecard's round cards */}
                    <div className="flex gap-2">
                      {/* R1 Best Ball (green-500 when active) */}
                      <div className={`flex-1 rounded-lg px-3 py-2 ${
                        standing.round1Completed > 0 ? "bg-green-500" : "bg-gray-50"
                      }`}>
                        <p className={`text-xs font-semibold ${standing.round1Completed > 0 ? "text-green-100" : "text-gray-400"}`}>R1 Best Ball</p>
                        <p className={`text-sm font-bold ${standing.round1Completed > 0 ? "text-white" : "text-gray-300"}`}>
                          {standing.round1Completed > 0 ? `${standing.round1Points} pts` : "–"}
                        </p>
                        <p className={`text-xs ${standing.round1Completed > 0 ? "text-green-100" : "text-gray-300"}`}>
                          {standing.round1Completed > 0 ? `${standing.round1Completed}/18 holes` : "upcoming"}
                        </p>
                      </div>

                      {/* R2 Skins (green-700 when active) */}
                      <div className={`flex-1 rounded-lg px-3 py-2 ${
                        standing.round2Completed > 0 ? "bg-green-700" : "bg-gray-50"
                      }`}>
                        <p className={`text-xs font-semibold ${standing.round2Completed > 0 ? "text-green-200" : "text-gray-400"}`}>R2 Skins</p>
                        <p className={`text-sm font-bold ${standing.round2Completed > 0 ? "text-white" : "text-gray-300"}`}>
                          {standing.round2Completed > 0
                            ? `${standing.round2Skins % 1 === 0 ? standing.round2Skins : standing.round2Skins.toFixed(1)} skins`
                            : "–"}
                        </p>
                        <p className={`text-xs ${standing.round2Completed > 0 ? "text-green-200" : "text-gray-300"}`}>
                          {standing.round2Completed > 0 ? `${standing.round2Completed}/18 holes` : "upcoming"}
                        </p>
                      </div>

                      {/* R3 Scramble (green-800 when active) */}
                      <div className={`flex-1 rounded-lg px-3 py-2 ${
                        standing.round3Completed > 0 ? "bg-green-800" : "bg-gray-50"
                      }`}>
                        <p className={`text-xs font-semibold ${standing.round3Completed > 0 ? "text-green-300" : "text-gray-400"}`}>R3 Scramble</p>
                        <p className={`text-sm font-bold ${standing.round3Completed > 0 ? "text-white" : "text-gray-300"}`}>
                          {standing.round3Completed > 0 ? `${standing.round3Points} pts` : "–"}
                        </p>
                        <p className={`text-xs ${standing.round3Completed > 0 ? "text-green-300" : "text-gray-300"}`}>
                          {standing.round3Completed > 0 ? `${standing.round3Completed}/18 holes` : "upcoming"}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>

          </>
        )}
      </div>
      </div>

      <BottomNav tournamentId={tournamentId} />
    </div>
  )
}
