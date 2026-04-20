"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

type Tournament = {
  id: string
  name: string
  year: number
  date: string | null
  current_round: number
  is_locked: boolean
  winner_team_name: string | null
  winner_points: number | null
  winner_photo_url: string | null
  courses: { name: string } | { name: string }[] | null
  teams: { id: string; name: string }[]
}

function getCourseName(t: Tournament): string | null {
  if (!t.courses) return null
  return Array.isArray(t.courses) ? t.courses[0]?.name ?? null : t.courses.name
}

function formatDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export default function Home() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTournaments = async () => {
      const { data } = await supabase
        .from("tournaments")
        .select(
          "id, name, year, date, current_round, is_locked, winner_team_name, winner_points, winner_photo_url, courses(name), teams(id, name)"
        )
        .order("year", { ascending: false })

      setTournaments(data || [])
      setLoading(false)
    }
    fetchTournaments()
  }, [])

  const open = tournaments.filter((t) => !t.is_locked)
  const past = tournaments.filter((t) => t.is_locked)

  if (loading) {
    return (
      <div className="flex flex-col flex-1 bg-green-50 items-center justify-center">
        <p className="text-green-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 bg-green-50 px-4 py-8">
      <div className="w-full max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <h1
            className="text-7xl text-green-900 leading-tight"
            style={{ fontFamily: "var(--font-dancing-script)" }}
          >
            SuperDay
          </h1>
          <p
            className="text-4xl text-green-700"
            style={{ fontFamily: "var(--font-dancing-script)" }}
          >
            Golf
          </p>
        </div>

        {/* Open Events */}
        {open.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h2 className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                Open
              </h2>
            </div>
            <div className="flex flex-col gap-3">
              {open.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl bg-white shadow-sm border border-green-200 overflow-hidden"
                >
                  <Link
                    href={`/tournament/${t.id}/leaderboard`}
                    className="block p-4 hover:bg-green-50 transition-colors"
                  >
                    <h3 className="font-bold text-green-900 text-lg">
                      {t.name} {t.year}
                    </h3>
                    {getCourseName(t) && (
                      <p className="text-sm text-green-600 mt-0.5">{getCourseName(t)}</p>
                    )}
                    {t.date && (
                      <p className="text-xs text-green-500 mt-0.5">{formatDate(t.date)}</p>
                    )}
                    {t.teams.length > 0 && (
                      <p className="text-xs text-green-500 mt-1">
                        {t.teams.map((team) => team.name).join(" vs ")}
                      </p>
                    )}
                  </Link>

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
                    <Link
                      href={`/tournament/${t.id}/close`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-green-600 hover:bg-green-50 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                      Close SuperDay
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Create button */}
        <div className="flex justify-center mb-8">
          <Link
            href="/setup"
            className="block w-full max-w-xs rounded-xl bg-green-700 py-4 text-base font-semibold text-white text-center shadow-sm hover:bg-green-800 transition-colors"
          >
            {tournaments.length === 0 ? "Set Up Your SuperDay" : "Create New SuperDay"}
          </Link>
        </div>

        {/* Empty state */}
        {tournaments.length === 0 && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-xl bg-white p-6 shadow-sm border border-green-200 w-full max-w-xs">
              <p className="text-sm font-medium text-green-800">
                3 Rounds &middot; 3 Formats &middot; 1 Champion
              </p>
            </div>
            <p className="text-sm text-green-600">No SuperDays yet. Create one to get started!</p>
          </div>
        )}

        {/* Past SuperDays Archive */}
        {past.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500">
                <path fillRule="evenodd" d="M10 1c-1.828 0-3.623.149-5.371.435a.75.75 0 00-.629.74v.387c-.827.157-1.642.345-2.445.564a.75.75 0 00-.552.698 5 5 0 004.503 5.152 6 6 0 002.946 1.822A6.451 6.451 0 017.768 13H7.5A1.5 1.5 0 006 14.5V17h-.75C4.56 17 4 17.56 4 18.25v.75h12v-.75c0-.69-.56-1.25-1.25-1.25H14v-2.5a1.5 1.5 0 00-1.5-1.5h-.268a6.453 6.453 0 01-.684-2.202 6 6 0 002.946-1.822 5 5 0 004.503-5.152.75.75 0 00-.552-.698A31.804 31.804 0 0016 2.562v-.387a.75.75 0 00-.629-.74A33.227 33.227 0 0010 1zM2.525 4.422C3.012 4.3 3.504 4.19 4 4.09V5c0 .74.134 1.448.38 2.103a3.503 3.503 0 01-1.855-2.68zm14.95 0a3.503 3.503 0 01-1.854 2.683C15.866 6.449 16 5.74 16 5v-.91c.496.099.988.21 1.475.332z" clipRule="evenodd" />
              </svg>
              <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                Past SuperDays
              </h2>
            </div>
            <div className="flex flex-col gap-4">
              {past.map((t) => (
                <Link
                  key={t.id}
                  href={`/tournament/${t.id}/leaderboard`}
                  className="block rounded-xl bg-white shadow-sm border border-amber-100 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Team photo or placeholder */}
                  {t.winner_photo_url ? (
                    <div className="w-full h-48 overflow-hidden">
                      <img
                        src={t.winner_photo_url}
                        alt={`${t.winner_team_name ?? "Winning team"} photo`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-24 bg-amber-50 flex items-center justify-center">
                      <span className="text-4xl">⛳</span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {t.winner_team_name && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-amber-500 text-base">🏆</span>
                            <span className="font-bold text-green-900 text-base truncate">
                              {t.winner_team_name}
                            </span>
                          </div>
                        )}
                        {t.winner_points !== null && (
                          <p className="text-sm text-green-600 mb-1.5">
                            {t.winner_points} pts
                          </p>
                        )}
                        {getCourseName(t) && (
                          <p className="text-xs text-green-500">{getCourseName(t)}</p>
                        )}
                        {t.date && (
                          <p className="text-xs text-green-400 mt-0.5">{formatDate(t.date)}</p>
                        )}
                      </div>
                      <span className="text-2xl font-bold text-green-100 shrink-0">{t.year}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
