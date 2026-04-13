"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import type { Tournament, Course, Hole, Team, Player } from "@/lib/types"

// ============================================
// STEP 1: Tournament Info
// ============================================
function TournamentStep({
  tournament,
  setTournament,
  onNext,
}: {
  tournament: { name: string; year: number; date: string; use_handicaps: boolean }
  setTournament: (t: typeof tournament) => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-green-900">Tournament Info</h2>
        <p className="text-sm text-green-700 mt-1">Basic details for this year&apos;s event.</p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-green-800">Tournament Name</span>
          <input
            type="text"
            value={tournament.name}
            onChange={(e) => setTournament({ ...tournament, name: e.target.value })}
            className="rounded-lg border border-green-300 px-4 py-3 text-base bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="SuperDay"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-green-800">Year</span>
          <input
            type="number"
            value={tournament.year}
            onChange={(e) => setTournament({ ...tournament, year: parseInt(e.target.value) || 2026 })}
            className="rounded-lg border border-green-300 px-4 py-3 text-base bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-green-800">Date</span>
          <input
            type="date"
            value={tournament.date}
            onChange={(e) => setTournament({ ...tournament, date: e.target.value })}
            className="rounded-lg border border-green-300 px-4 py-3 text-base bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </label>

        <label className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            checked={tournament.use_handicaps}
            onChange={(e) => setTournament({ ...tournament, use_handicaps: e.target.checked })}
            className="h-5 w-5 rounded border-green-300 text-green-600 focus:ring-green-500"
          />
          <div>
            <span className="text-sm font-medium text-green-800">Use Handicaps</span>
            <p className="text-xs text-green-600">Adjust scoring based on player handicaps</p>
          </div>
        </label>
      </div>

      <button
        onClick={onNext}
        disabled={!tournament.name || !tournament.year}
        className="w-full rounded-xl bg-green-700 py-4 text-base font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Next: Course Setup
      </button>
    </div>
  )
}

// ============================================
// STEP 2: Course & Holes
// ============================================
function CourseStep({
  courseName,
  setCourseName,
  holes,
  setHoles,
  onNext,
  onBack,
}: {
  courseName: string
  setCourseName: (n: string) => void
  holes: { hole_number: number; par: number; yardage_white: string; yardage_blue: string; yardage_red: string }[]
  setHoles: (h: typeof holes) => void
  onNext: () => void
  onBack: () => void
}) {
  const updateHole = (index: number, field: string, value: string | number) => {
    const updated = [...holes]
    updated[index] = { ...updated[index], [field]: value }
    setHoles(updated)
  }

  const allParsEntered = holes.every((h) => h.par >= 3 && h.par <= 6)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-green-900">Course Setup</h2>
        <p className="text-sm text-green-700 mt-1">Enter the course name and details for each hole. Par is required; yardages are optional.</p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-green-800">Course Name</span>
        <input
          type="text"
          value={courseName}
          onChange={(e) => setCourseName(e.target.value)}
          className="rounded-lg border border-green-300 px-4 py-3 text-base bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="e.g., Pine Valley Golf Club"
        />
      </label>

      {/* Header row */}
      <div className="grid grid-cols-[3rem_3.5rem_1fr_1fr_1fr] gap-2 text-xs font-semibold text-green-700 px-1">
        <span>Hole</span>
        <span>Par</span>
        <span>White</span>
        <span>Blue</span>
        <span>Red</span>
      </div>

      {/* Hole rows */}
      <div className="flex flex-col gap-2">
        {holes.map((hole, i) => (
          <div
            key={hole.hole_number}
            className="grid grid-cols-[3rem_3.5rem_1fr_1fr_1fr] gap-2 items-center"
          >
            <span className="text-sm font-bold text-green-900 text-center">
              {hole.hole_number}
            </span>
            <select
              value={hole.par}
              onChange={(e) => updateHole(i, "par", parseInt(e.target.value))}
              className="rounded-lg border border-green-300 px-2 py-2.5 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
            <input
              type="number"
              value={hole.yardage_white}
              onChange={(e) => updateHole(i, "yardage_white", e.target.value)}
              className="rounded-lg border border-green-300 px-2 py-2.5 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Yds"
            />
            <input
              type="number"
              value={hole.yardage_blue}
              onChange={(e) => updateHole(i, "yardage_blue", e.target.value)}
              className="rounded-lg border border-green-300 px-2 py-2.5 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Yds"
            />
            <input
              type="number"
              value={hole.yardage_red}
              onChange={(e) => updateHole(i, "yardage_red", e.target.value)}
              className="rounded-lg border border-green-300 px-2 py-2.5 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Yds"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border-2 border-green-700 py-4 text-base font-semibold text-green-700 hover:bg-green-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!courseName || !allParsEntered}
          className="flex-1 rounded-xl bg-green-700 py-4 text-base font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next: Teams
        </button>
      </div>
    </div>
  )
}

// ============================================
// STEP 3: Teams & Players
// ============================================
function TeamsStep({
  teams,
  setTeams,
  onBack,
  onSave,
  saving,
}: {
  teams: { name: string; players: { name: string; handicap: string }[] }[]
  setTeams: (t: typeof teams) => void
  onBack: () => void
  onSave: () => void
  saving: boolean
}) {
  const addTeam = () => {
    setTeams([
      ...teams,
      {
        name: "",
        players: [
          { name: "", handicap: "0" },
          { name: "", handicap: "0" },
          { name: "", handicap: "0" },
          { name: "", handicap: "0" },
        ],
      },
    ])
  }

  const removeTeam = (teamIndex: number) => {
    if (teams.length <= 2) return // Minimum 2 teams
    setTeams(teams.filter((_, i) => i !== teamIndex))
  }

  const updateTeamName = (teamIndex: number, name: string) => {
    const updated = [...teams]
    updated[teamIndex] = { ...updated[teamIndex], name }
    setTeams(updated)
  }

  const updatePlayer = (teamIndex: number, playerIndex: number, field: string, value: string) => {
    const updated = [...teams]
    const players = [...updated[teamIndex].players]
    players[playerIndex] = { ...players[playerIndex], [field]: value }
    updated[teamIndex] = { ...updated[teamIndex], players }
    setTeams(updated)
  }

  const allTeamsValid = teams.every(
    (t) => t.name && t.players.every((p) => p.name)
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-green-900">Teams & Players</h2>
        <p className="text-sm text-green-700 mt-1">Enter team names and 4 players per team. Handicaps are optional for now.</p>
      </div>

      {teams.map((team, teamIndex) => (
        <div key={teamIndex} className="rounded-xl border-2 border-green-200 bg-white p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                Team {teamIndex + 1}
              </span>
              <input
                type="text"
                value={team.name}
                onChange={(e) => updateTeamName(teamIndex, e.target.value)}
                className="rounded-lg border border-green-300 px-4 py-3 text-base font-semibold bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder={`Team ${teamIndex + 1} name`}
              />
            </label>
            {teams.length > 2 && (
              <button
                onClick={() => removeTeam(teamIndex)}
                className="ml-3 mt-5 text-red-400 hover:text-red-600 text-sm font-medium"
              >
                Remove
              </button>
            )}
          </div>

          {team.players.map((player, playerIndex) => (
            <div key={playerIndex} className="grid grid-cols-[1fr_4.5rem] gap-2 items-end">
              <label className="flex flex-col gap-1">
                {playerIndex === 0 && (
                  <span className="text-xs font-medium text-green-700">Player Name</span>
                )}
                <input
                  type="text"
                  value={player.name}
                  onChange={(e) => updatePlayer(teamIndex, playerIndex, "name", e.target.value)}
                  className="rounded-lg border border-green-300 px-3 py-2.5 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder={`Player ${playerIndex + 1}`}
                />
              </label>
              <label className="flex flex-col gap-1">
                {playerIndex === 0 && (
                  <span className="text-xs font-medium text-green-700">HCP</span>
                )}
                <input
                  type="number"
                  value={player.handicap}
                  onChange={(e) => updatePlayer(teamIndex, playerIndex, "handicap", e.target.value)}
                  className="rounded-lg border border-green-300 px-2 py-2.5 text-sm text-center bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="0"
                />
              </label>
            </div>
          ))}
        </div>
      ))}

      {teams.length < 4 && (
        <button
          onClick={addTeam}
          className="w-full rounded-xl border-2 border-dashed border-green-400 py-4 text-base font-medium text-green-600 hover:bg-green-50 transition-colors"
        >
          + Add Another Team
        </button>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border-2 border-green-700 py-4 text-base font-semibold text-green-700 hover:bg-green-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSave}
          disabled={!allTeamsValid || saving}
          className="flex-1 rounded-xl bg-green-700 py-4 text-base font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save Tournament"}
        </button>
      </div>
    </div>
  )
}

// ============================================
// SUCCESS SCREEN
// ============================================
function SuccessScreen({ tournamentId }: { tournamentId: string }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center py-8">
      <span className="text-5xl">&#9971;</span>
      <h2 className="text-2xl font-bold text-green-900">Tournament Created!</h2>
      <p className="text-green-700 max-w-xs">
        Your SuperDay tournament is all set up. You can now start entering scores when it&apos;s game time.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <a
          href="/"
          className="block w-full rounded-xl bg-green-700 py-4 text-base font-semibold text-white text-center shadow-sm hover:bg-green-800 transition-colors"
        >
          Go to Home
        </a>
        <a
          href={`/setup?edit=${tournamentId}`}
          className="block w-full rounded-xl border-2 border-green-700 py-4 text-base font-semibold text-green-700 text-center hover:bg-green-50 transition-colors"
        >
          Edit Tournament
        </a>
      </div>
    </div>
  )
}

// ============================================
// MAIN SETUP PAGE
// ============================================
export default function SetupPage() {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedTournamentId, setSavedTournamentId] = useState<string | null>(null)

  // Step 1: Tournament info
  const [tournament, setTournament] = useState({
    name: "SuperDay",
    year: new Date().getFullYear(),
    date: "",
    use_handicaps: false,
  })

  // Step 2: Course & holes
  const [courseName, setCourseName] = useState("")
  const [holes, setHoles] = useState(
    Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par: 4,
      yardage_white: "",
      yardage_blue: "",
      yardage_red: "",
    }))
  )

  // Step 3: Teams & players
  const [teams, setTeams] = useState([
    {
      name: "",
      players: [
        { name: "", handicap: "0" },
        { name: "", handicap: "0" },
        { name: "", handicap: "0" },
        { name: "", handicap: "0" },
      ],
    },
    {
      name: "",
      players: [
        { name: "", handicap: "0" },
        { name: "", handicap: "0" },
        { name: "", handicap: "0" },
        { name: "", handicap: "0" },
      ],
    },
  ])

  // Save everything to Supabase
  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      // 1. Create the course
      const { data: courseData, error: courseError } = await supabase
        .from("courses")
        .insert({ name: courseName })
        .select()
        .single()

      if (courseError) throw new Error("Failed to save course: " + courseError.message)

      // 2. Create the 18 holes
      const holesData = holes.map((h) => ({
        course_id: courseData.id,
        hole_number: h.hole_number,
        par: h.par,
        yardage_white: h.yardage_white ? parseInt(h.yardage_white) : null,
        yardage_blue: h.yardage_blue ? parseInt(h.yardage_blue) : null,
        yardage_red: h.yardage_red ? parseInt(h.yardage_red) : null,
      }))

      const { error: holesError } = await supabase.from("holes").insert(holesData)
      if (holesError) throw new Error("Failed to save holes: " + holesError.message)

      // 3. Create the tournament
      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .insert({
          name: tournament.name,
          year: tournament.year,
          date: tournament.date || null,
          course_id: courseData.id,
          use_handicaps: tournament.use_handicaps,
        })
        .select()
        .single()

      if (tournamentError) throw new Error("Failed to save tournament: " + tournamentError.message)

      // 4. Create the 3 round settings (these are always the same format/tee combo)
      const roundSettings = [
        { tournament_id: tournamentData.id, round_number: 1, format: "best_ball_stableford", tee_box: "white" },
        { tournament_id: tournamentData.id, round_number: 2, format: "skins", tee_box: "blue" },
        { tournament_id: tournamentData.id, round_number: 3, format: "scramble_stableford", tee_box: "red" },
      ]

      const { error: roundsError } = await supabase.from("round_settings").insert(roundSettings)
      if (roundsError) throw new Error("Failed to save round settings: " + roundsError.message)

      // 5. Create teams and players
      for (let i = 0; i < teams.length; i++) {
        const team = teams[i]

        const { data: teamData, error: teamError } = await supabase
          .from("teams")
          .insert({
            tournament_id: tournamentData.id,
            name: team.name,
            sort_order: i,
          })
          .select()
          .single()

        if (teamError) throw new Error("Failed to save team: " + teamError.message)

        const playersData = team.players.map((p, j) => ({
          team_id: teamData.id,
          name: p.name,
          handicap: parseInt(p.handicap) || 0,
          sort_order: j,
        }))

        const { error: playersError } = await supabase.from("players").insert(playersData)
        if (playersError) throw new Error("Failed to save players: " + playersError.message)
      }

      setSavedTournamentId(tournamentData.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  // If we already saved, show the success screen
  if (savedTournamentId) {
    return (
      <div className="flex flex-col flex-1 bg-green-50 px-4 py-6">
        <div className="w-full max-w-lg mx-auto">
          <SuccessScreen tournamentId={savedTournamentId} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 bg-green-50 px-4 py-6">
      <div className="w-full max-w-lg mx-auto">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  s === step
                    ? "bg-green-700 text-white"
                    : s < step
                    ? "bg-green-500 text-white"
                    : "bg-green-200 text-green-600"
                }`}
              >
                {s < step ? "\u2713" : s}
              </div>
              {s < 3 && (
                <div
                  className={`w-12 h-0.5 ${
                    s < step ? "bg-green-500" : "bg-green-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Steps */}
        {step === 1 && (
          <TournamentStep
            tournament={tournament}
            setTournament={setTournament}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <CourseStep
            courseName={courseName}
            setCourseName={setCourseName}
            holes={holes}
            setHoles={setHoles}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <TeamsStep
            teams={teams}
            setTeams={setTeams}
            onBack={() => setStep(2)}
            onSave={handleSave}
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}
