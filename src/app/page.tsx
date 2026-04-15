"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

type TournamentWithCourse = {
  id: string
  name: string
  year: number
  date: string | null
  current_round: number
  courses: { name: string } | { name: string }[] | null
  teams: { id: string; name: string }[]
}

export default function Home() {
  const [tournaments, setTournaments] = useState<TournamentWithCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchTournaments = async () => {
    const { data } = await supabase
      .from("tournaments")
      .select("id, name, year, date, current_round, courses(name), teams(id, name)")
      .order("year", { ascending: false })

    setTournaments(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchTournaments()
  }, [])

  const handleDelete = async (tournament: TournamentWithCourse) => {
    const confirmed = window.confirm(
      `Delete "${tournament.name} ${tournament.year}"? This will permanently remove all teams, players, scores, and pairings for this tournament. This cannot be undone.`
    )
    if (!confirmed) return

    setDeleting(tournament.id)

    // Delete in order: scores → r2_pairings → players → teams → round_settings → tournament
    // (Cascade handles most of this, but we also need to clean up the course)
    const { data: tournamentData } = await supabase
      .from("tournaments")
      .select("course_id")
      .eq("id", tournament.id)
      .single()

    await supabase.from("tournaments").delete().eq("id", tournament.id)

    // Clean up the course if it's not used by another tournament
    if (tournamentData?.course_id) {
      const { data: otherTournaments } = await supabase
        .from("tournaments")
        .select("id")
        .eq("course_id", tournamentData.course_id)

      if (!otherTournaments || otherTournaments.length === 0) {
        await supabase.from("courses").delete().eq("id", tournamentData.course_id)
      }
    }

    setDeleting(null)
    fetchTournaments()
  }

  return (
    <div className="flex flex-col flex-1 bg-green-50 px-4 py-8">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 mb-8 text-center">
          <span className="text-5xl">&#9971;</span>
          <h1 className="text-4xl font-bold tracking-tight text-green-900">
            SuperDay
          </h1>
          <p className="text-lg text-green-700">
            Annual Golf Tournament
          </p>
        </div>

        {/* Tournaments list */}
        {loading ? (
          <p className="text-center text-green-600">Loading...</p>
        ) : tournaments.length === 0 ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-xl bg-white p-6 shadow-sm border border-green-200 w-full max-w-xs">
              <p className="text-sm font-medium text-green-800">
                3 Rounds &middot; 3 Formats &middot; 1 Champion
              </p>
            </div>
            <p className="text-sm text-green-600">
              No tournaments yet. Create one to get started!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-6">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="rounded-xl bg-white p-4 shadow-sm border border-green-200"
              >
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="font-bold text-green-900 text-lg">
                      {t.name} {t.year}
                    </h3>
                    {t.courses && (
                      <p className="text-sm text-green-600 mt-0.5">
                        {Array.isArray(t.courses) ? t.courses[0]?.name : t.courses.name}
                      </p>
                    )}
                    {t.date && (
                      <p className="text-xs text-green-500 mt-0.5">
                        {new Date(t.date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )}
                    {t.teams.length > 0 && (
                      <p className="text-xs text-green-500 mt-1">
                        {t.teams.map((team) => team.name).join(" vs ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Link
                      href={`/tournament/${t.id}/score`}
                      className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 transition-colors"
                    >
                      Enter Scores
                    </Link>
                    <Link
                      href={`/tournament/${t.id}/pairings`}
                      className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors"
                    >
                      R2 Pairings
                    </Link>
                    <Link
                      href={`/setup?edit=${t.id}`}
                      className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(t)}
                      disabled={deleting === t.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {deleting === t.id ? "..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create button */}
        <div className="flex justify-center mt-4">
          <Link
            href="/setup"
            className="block w-full max-w-xs rounded-xl bg-green-700 py-4 text-base font-semibold text-white text-center shadow-sm hover:bg-green-800 transition-colors"
          >
            {tournaments.length > 0 ? "Create New Tournament" : "Set Up Tournament"}
          </Link>
        </div>
      </div>
    </div>
  )
}
