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
        <div className="flex flex-col items-center mb-8 text-center">
          <h1 className="text-7xl text-green-900 leading-tight" style={{ fontFamily: "var(--font-dancing-script)" }}>
            SuperDay
          </h1>
          <p className="text-4xl text-green-700" style={{ fontFamily: "var(--font-dancing-script)" }}>
            Golf
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
              No SuperDays yet. Create one to get started!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-6">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="rounded-xl bg-white shadow-sm border border-green-200 overflow-hidden"
              >
                {/* Clickable card body → leaderboard */}
                <Link
                  href={`/tournament/${t.id}/leaderboard`}
                  className="block p-4 hover:bg-green-50 transition-colors"
                >
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
                </Link>

                {/* Action buttons */}
                <div className="flex border-t border-green-100">
                  <Link
                    href={`/tournament/${t.id}/settings`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors border-r border-green-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                    Settings
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(t)
                    }}
                    disabled={deleting === t.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    {deleting === t.id ? "..." : "Delete"}
                  </button>
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
            {tournaments.length > 0 ? "Create New SuperDay" : "Set Up Your SuperDay"}
          </Link>
        </div>
      </div>
    </div>
  )
}
