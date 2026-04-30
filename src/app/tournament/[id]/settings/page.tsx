"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"
import OrganizerGuard from "@/components/OrganizerGuard"

type Player = { id: string; name: string; handicap: number | null; person_id: string }
type Team = { id: string; name: string; players: Player[] }
type RoundSetting = { round_number: number; format: string; tee_box: string }

const TEE_BOXES = ["white", "blue", "red", "gold", "black"]

const formatLabel = (format: string) => {
  switch (format) {
    case "best_ball_stableford": return "Best Ball"
    case "skins": return "Skins"
    case "scramble_stableford": return "Scramble"
    default: return format
  }
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
    </svg>
  )
}

function SaveCancelRow({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex gap-2 mt-4">
      <button
        onClick={onCancel}
        className="flex-1 rounded-lg border border-green-300 py-2 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="flex-1 rounded-lg bg-green-700 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  )
}

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <OrganizerGuard>
      <SettingsContent params={params} />
    </OrganizerGuard>
  )
}

function SettingsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Raw data
  const [tournamentRaw, setTournamentRaw] = useState({ name: "", year: 0, date: "" })
  const [courseId, setCourseId] = useState<string | null>(null)
  const [course, setCourse] = useState<{ name: string } | null>(null)
  const [rounds, setRounds] = useState<RoundSetting[]>([])
  const [teams, setTeams] = useState<Team[]>([])

  // Draft states
  const [draftDetails, setDraftDetails] = useState({ name: "", year: 0, date: "" })
  const [draftCourse, setDraftCourse] = useState("")
  const [draftRounds, setDraftRounds] = useState<RoundSetting[]>([])
  const [draftTeams, setDraftTeams] = useState<Team[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("name, year, date, course_id")
        .eq("id", tournamentId)
        .single()

      if (tournament) {
        setTournamentRaw({ name: tournament.name, year: tournament.year, date: tournament.date || "" })
        setCourseId(tournament.course_id)

        if (tournament.course_id) {
          const { data: courseData } = await supabase
            .from("courses")
            .select("name")
            .eq("id", tournament.course_id)
            .single()
          if (courseData) setCourse(courseData)
        }
      }

      const { data: roundsData } = await supabase
        .from("round_settings")
        .select("round_number, format, tee_box")
        .eq("tournament_id", tournamentId)
        .order("round_number")
      setRounds(roundsData || [])

      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name, sort_order, tournament_players(id, handicap, sort_order, people(id, display_name))")
        .eq("tournament_id", tournamentId)
        .order("sort_order")

      if (teamsData) {
        const sorted = teamsData.map((t) => ({
          ...t,
          players: (t.tournament_players || [])
            .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((tp: any) => ({
              id: tp.id as string,
              name: tp.people.display_name as string,
              handicap: tp.handicap as number | null,
              person_id: tp.people.id as string,
            })),
        }))
        setTeams(sorted)
      }

      setLoading(false)
    }
    fetchData()
  }, [tournamentId])

  // ── SAVE HANDLERS ──────────────────────────────────────────

  async function saveDetails() {
    setSaving(true)
    await supabase.from("tournaments").update({
      name: draftDetails.name,
      year: draftDetails.year,
      date: draftDetails.date || null,
    }).eq("id", tournamentId)
    setTournamentRaw(draftDetails)
    setSaving(false)
    setEditingSection(null)
  }

  async function saveCourse() {
    setSaving(true)
    if (courseId) {
      await supabase.from("courses").update({ name: draftCourse }).eq("id", courseId)
    }
    setCourse({ name: draftCourse })
    setSaving(false)
    setEditingSection(null)
  }

  async function saveRounds() {
    setSaving(true)
    for (const r of draftRounds) {
      await supabase.from("round_settings")
        .update({ tee_box: r.tee_box })
        .eq("tournament_id", tournamentId)
        .eq("round_number", r.round_number)
    }
    setRounds([...draftRounds])
    setSaving(false)
    setEditingSection(null)
  }

  async function saveTeams() {
    setSaving(true)
    for (const team of draftTeams) {
      await supabase.from("teams").update({ name: team.name }).eq("id", team.id)
      for (const player of team.players) {
        // name lives on people, handicap lives on tournament_players
        await supabase.from("people").update({ display_name: player.name }).eq("id", player.person_id)
        await supabase.from("tournament_players").update({ handicap: player.handicap }).eq("id", player.id)
      }
    }
    setTeams(JSON.parse(JSON.stringify(draftTeams)))
    setSaving(false)
    setEditingSection(null)
  }

  // ── OPEN EDIT HELPERS ──────────────────────────────────────

  function openDetails() {
    setDraftDetails({ ...tournamentRaw })
    setEditingSection("details")
  }

  function openCourse() {
    setDraftCourse(course?.name || "")
    setEditingSection("course")
  }

  function openRounds() {
    setDraftRounds(rounds.map((r) => ({ ...r })))
    setEditingSection("rounds")
  }

  function openTeams() {
    setDraftTeams(JSON.parse(JSON.stringify(teams)))
    setEditingSection("teams")
  }

  async function deleteTournament() {
    setDeleting(true)
    await supabase.from("scores").delete().eq("tournament_id", tournamentId)
    await supabase.from("r2_pairings").delete().eq("tournament_id", tournamentId)
    await supabase.from("tournament_players").delete().eq("tournament_id", tournamentId)
    await supabase.from("teams").delete().eq("tournament_id", tournamentId)
    await supabase.from("round_settings").delete().eq("tournament_id", tournamentId)
    await supabase.from("tournaments").delete().eq("id", tournamentId)
    if (courseId) await supabase.from("courses").delete().eq("id", courseId)
    router.push("/")
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading...</p>
      </div>
    )
  }

  const displayName = `${tournamentRaw.name} ${tournamentRaw.year}`

  return (
    <div className="flex flex-col flex-1 bg-green-50">
      <div className="flex-1 px-4 py-6">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-green-900 mb-1">Settings</h1>
          <p className="text-sm text-green-600 mb-6">{displayName}</p>

          {/* ── SUPERDAY DETAILS ─────────────────────────────────── */}
          <div className="rounded-xl bg-white border border-green-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide">SuperDay Details</h3>
              {editingSection !== "details" && (
                <button onClick={openDetails} className="text-green-400 hover:text-green-600 transition-colors">
                  <EditIcon />
                </button>
              )}
            </div>

            {editingSection === "details" ? (
              <>
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-green-700">Name</span>
                    <input
                      type="text"
                      value={draftDetails.name}
                      onChange={(e) => setDraftDetails({ ...draftDetails, name: e.target.value })}
                      className="rounded-lg border border-green-300 px-3 py-2 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-green-700">Year</span>
                    <input
                      type="number"
                      value={draftDetails.year}
                      onChange={(e) => setDraftDetails({ ...draftDetails, year: parseInt(e.target.value) || draftDetails.year })}
                      className="rounded-lg border border-green-300 px-3 py-2 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-green-700">Date</span>
                    <input
                      type="date"
                      value={draftDetails.date}
                      onChange={(e) => setDraftDetails({ ...draftDetails, date: e.target.value })}
                      className="rounded-lg border border-green-300 px-3 py-2 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </label>
                </div>
                <SaveCancelRow onSave={saveDetails} onCancel={() => setEditingSection(null)} saving={saving} />
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="font-medium text-green-900">{tournamentRaw.name} {tournamentRaw.year}</p>
                {tournamentRaw.date && (
                  <p className="text-sm text-green-600">
                    {new Date(tournamentRaw.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── COURSE ───────────────────────────────────────────── */}
          {course && (
            <div className="rounded-xl bg-white border border-green-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide">Course</h3>
                {editingSection !== "course" && (
                  <button onClick={openCourse} className="text-green-400 hover:text-green-600 transition-colors">
                    <EditIcon />
                  </button>
                )}
              </div>

              {editingSection === "course" ? (
                <>
                  <input
                    type="text"
                    value={draftCourse}
                    onChange={(e) => setDraftCourse(e.target.value)}
                    className="w-full rounded-lg border border-green-300 px-3 py-2 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <SaveCancelRow onSave={saveCourse} onCancel={() => setEditingSection(null)} saving={saving} />
                </>
              ) : (
                <p className="font-medium text-green-900">{course.name}</p>
              )}
            </div>
          )}

          {/* ── ROUNDS ───────────────────────────────────────────── */}
          <div className="rounded-xl bg-white border border-green-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide">Rounds</h3>
              {editingSection !== "rounds" && (
                <button onClick={openRounds} className="text-green-400 hover:text-green-600 transition-colors">
                  <EditIcon />
                </button>
              )}
            </div>

            {editingSection === "rounds" ? (
              <>
                <div className="flex flex-col gap-3">
                  {draftRounds.map((r, i) => (
                    <div key={r.round_number} className="flex items-center justify-between gap-3 py-1.5 border-b border-green-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-green-900">R{r.round_number} · {formatLabel(r.format)}</p>
                        <p className="text-xs text-green-500">Format is fixed</p>
                      </div>
                      <select
                        value={r.tee_box}
                        onChange={(e) => {
                          const updated = [...draftRounds]
                          updated[i] = { ...updated[i], tee_box: e.target.value }
                          setDraftRounds(updated)
                        }}
                        className="rounded-lg border border-green-300 px-2 py-1.5 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500 capitalize"
                      >
                        {TEE_BOXES.map((t) => (
                          <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)} tees</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <SaveCancelRow onSave={saveRounds} onCancel={() => setEditingSection(null)} saving={saving} />
              </>
            ) : (
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
            )}
          </div>

          {/* ── TEAMS & ROSTERS ──────────────────────────────────── */}
          <div className="rounded-xl bg-white border border-green-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide">Teams & Rosters</h3>
              {editingSection !== "teams" && (
                <button onClick={openTeams} className="text-green-400 hover:text-green-600 transition-colors">
                  <EditIcon />
                </button>
              )}
            </div>

            {editingSection === "teams" ? (
              <>
                <div className="flex flex-col gap-5">
                  {draftTeams.map((team, ti) => (
                    <div key={team.id}>
                      <label className="flex flex-col gap-1 mb-3">
                        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Team Name</span>
                        <input
                          type="text"
                          value={team.name}
                          onChange={(e) => {
                            const updated = [...draftTeams]
                            updated[ti] = { ...updated[ti], name: e.target.value }
                            setDraftTeams(updated)
                          }}
                          className="rounded-lg border border-green-300 px-3 py-2 text-sm font-semibold bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </label>
                      <div className="flex flex-col gap-2 pl-1">
                        {team.players.map((player, pi) => (
                          <div key={player.id} className="flex gap-2">
                            <input
                              type="text"
                              value={player.name}
                              onChange={(e) => {
                                const updated = JSON.parse(JSON.stringify(draftTeams))
                                updated[ti].players[pi].name = e.target.value
                                setDraftTeams(updated)
                              }}
                              placeholder="Player name"
                              className="flex-1 rounded-lg border border-green-200 px-3 py-1.5 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <input
                              type="number"
                              value={player.handicap ?? ""}
                              onChange={(e) => {
                                const updated = JSON.parse(JSON.stringify(draftTeams))
                                updated[ti].players[pi].handicap = e.target.value === "" ? null : parseInt(e.target.value)
                                setDraftTeams(updated)
                              }}
                              placeholder="HCP"
                              className="w-16 rounded-lg border border-green-200 px-2 py-1.5 text-sm bg-white text-green-900 text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                        ))}
                      </div>
                      {ti < draftTeams.length - 1 && <div className="mt-4 border-b border-green-100" />}
                    </div>
                  ))}
                </div>
                <SaveCancelRow onSave={saveTeams} onCancel={() => setEditingSection(null)} saving={saving} />
              </>
            ) : (
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
            )}
          </div>

          {/* ── SCORING RULES (read-only) ─────────────────────────── */}
          <div className="rounded-xl bg-white border border-green-200 p-4 mb-4">
            <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-3">Scoring Rules</h3>

            <p className="text-xs font-semibold text-green-700 mb-1.5">R1 · Stableford (Best Ball)</p>
            <div className="grid grid-cols-5 gap-2 text-center text-xs mb-4">
              {[["8","Albatross"],["4","Eagle"],["2","Birdie"],["1","Par"],["0","Bogey+"]].map(([pts, label]) => (
                <div key={label}>
                  <p className="font-bold text-green-900">{pts}</p>
                  <p className="text-green-500">{label}</p>
                </div>
              ))}
            </div>

            <p className="text-xs font-semibold text-green-700 mb-1.5">R2 · Skins</p>
            <p className="text-xs text-green-600 mb-4">1 skin per hole. Lowest score wins outright. Ties carry over. After hole 18, remaining skins split (half-point).</p>

            <p className="text-xs font-semibold text-green-700 mb-1.5">R3 · Adjusted Stableford (Scramble)</p>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              {[["8","Albatross"],["4","Eagle"],["1","Birdie"],["0","Par"],["-2","Bogey+"]].map(([pts, label]) => (
                <div key={label}>
                  <p className={`font-bold ${pts === "-2" ? "text-red-600" : "text-green-900"}`}>{pts}</p>
                  <p className="text-green-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── R2 PAIRINGS LINK ─────────────────────────────────── */}
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

          {/* ── CLOSE SUPERDAY ───────────────────────────────────── */}
          <Link
            href={`/tournament/${tournamentId}/close`}
            className="block rounded-xl bg-white border border-amber-200 p-4 hover:bg-amber-50 transition-colors mt-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Close SuperDay</h3>
                <p className="text-sm text-green-900 mt-0.5">Record final results and move to archive</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-400">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </Link>

          {/* ── DELETE SUPERDAY ──────────────────────────────────── */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded-xl bg-white border border-red-200 p-4 hover:bg-red-50 transition-colors mt-2 text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wide">Delete SuperDay</h3>
                <p className="text-sm text-green-900 mt-0.5">Permanently remove this SuperDay and all its data</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-400">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
              </svg>
            </div>
          </button>

        </div>
      </div>

      {/* ── DELETE CONFIRMATION MODAL ────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-red-700 mb-2">Delete SuperDay?</h2>
            <p className="text-sm text-green-800 mb-1">
              This will permanently delete <span className="font-semibold">{tournamentRaw.name} {tournamentRaw.year}</span> and all of its scores, teams, and data.
            </p>
            <p className="text-sm text-red-600 font-medium mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-green-300 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteTournament}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav tournamentId={tournamentId} />
    </div>
  )
}
