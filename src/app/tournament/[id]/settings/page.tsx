"use client"

import { useState, useEffect, use } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"

type Team = {
  id: string
  name: string
  players: { id: string; name: string; handicap: number | null }[]
}

type RoundSetting = {
  round_number: number
  format: string
  tee_box: string
}

type Course = {
  name: string
}

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params)
  const [tournamentName, setTournamentName] = useState("")
  const [course, setCourse] = useState<Course | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [rounds, setRounds] = useState<RoundSetting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      // Tournament + course
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("name, year, course_id")
        .eq("id", tournamentId)
        .single()

      if (tournament) {
        setTournamentName(`${tournament.name} ${tournament.year}`)

        if (tournament.course_id) {
          const { data: courseData } = await supabase
            .from("courses")
            .select("name")
            .eq("id", tournament.course_id)
            .single()
          setCourse(courseData)
        }
      }

      // Round settings
      const { data: roundsData } = await supabase
        .from("round_settings")
        .select("round_number, format, tee_box")
        .eq("tournament_id", tournamentId)
        .order("round_number")
      setRounds(roundsData || [])

      // Teams + players
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name, sort_order, players(id, name, handicap, sort_order)")
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

  const formatLabel = (format: string) => {
    switch (format) {
      case "best_ball_stableford": return "Best Ball (Stableford)"
      case "skins": return "Skins"
      case "scramble_stableford": return "Scramble (Stableford)"
      default: return format
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 bg-green-50">
      <div className="flex-1 px-4 py-6">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-green-900 mb-1">Settings</h1>
          <p className="text-sm text-green-600 mb-6">{tournamentName}</p>

          {/* Edit tournament button */}
          <Link
            href={`/setup?edit=${tournamentId}`}
            className="block w-full rounded-xl bg-green-700 py-3 text-sm font-semibold text-white text-center shadow-sm hover:bg-green-800 transition-colors mb-6"
          >
            Edit Tournament Setup
          </Link>

          {/* Course info */}
          {course && (
            <div className="rounded-xl bg-white border border-green-200 p-4 mb-4">
              <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Course</h3>
              <p className="font-medium text-green-900">{course.name}</p>
            </div>
          )}

          {/* Round settings */}
          <div className="rounded-xl bg-white border border-green-200 p-4 mb-4">
            <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-3">Rounds</h3>
            <div className="flex flex-col gap-2">
              {rounds.map((r) => (
                <div key={r.round_number} className="flex items-center justify-between py-1.5 border-b border-green-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-green-900">Round {r.round_number}</p>
                    <p className="text-xs text-green-600">{formatLabel(r.format)}</p>
                  </div>
                  <span className="text-xs text-green-500 capitalize">{r.tee_box} tees</span>
                </div>
              ))}
            </div>
          </div>

          {/* Teams & rosters */}
          <div className="rounded-xl bg-white border border-green-200 p-4 mb-4">
            <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-3">Teams & Rosters</h3>
            <div className="flex flex-col gap-3">
              {teams.map((team) => (
                <div key={team.id} className="border-b border-green-50 last:border-0 pb-2 last:pb-0">
                  <p className="text-sm font-bold text-green-900 mb-1">{team.name}</p>
                  <div className="flex flex-col gap-0.5">
                    {team.players.map((p) => (
                      <div key={p.id} className="flex items-center justify-between">
                        <span className="text-xs text-green-700">{p.name}</span>
                        {p.handicap !== null && (
                          <span className="text-xs text-green-500">HCP {p.handicap}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scoring rules */}
          <div className="rounded-xl bg-white border border-green-200 p-4 mb-4">
            <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-3">Scoring Rules</h3>

            <p className="text-xs font-semibold text-green-700 mb-1.5">R1 &middot; Stableford (Best Ball)</p>
            <div className="grid grid-cols-5 gap-2 text-center text-xs mb-4">
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

            <p className="text-xs font-semibold text-green-700 mb-1.5">R2 &middot; Skins</p>
            <p className="text-xs text-green-600 mb-4">1 skin per hole. Lowest score wins outright. Ties carry over. After hole 18, remaining skins split (half-point).</p>

            <p className="text-xs font-semibold text-green-700 mb-1.5">R3 &middot; Adjusted Stableford (Scramble)</p>
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
                <p className="font-bold text-green-900">1</p>
                <p className="text-green-500">Birdie</p>
              </div>
              <div>
                <p className="font-bold text-green-900">0</p>
                <p className="text-green-500">Par</p>
              </div>
              <div>
                <p className="font-bold text-red-600">-2</p>
                <p className="text-green-500">Bogey+</p>
              </div>
            </div>
          </div>

          {/* R2 Pairings link */}
          <Link
            href={`/tournament/${tournamentId}/pairings`}
            className="block rounded-xl bg-white border border-green-200 p-4 hover:bg-green-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide">R2 Pairings</h3>
                <p className="text-sm text-green-900 mt-0.5">View or edit Round 2 skins pairings</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-400">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </Link>
        </div>
      </div>

      <BottomNav tournamentId={tournamentId} />
    </div>
  )
}
