"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

// ============================================
// PLAYER INPUT with typeahead
// ============================================
type PersonSuggestion = { id: string; display_name: string }

type PlayerForm = {
  personId: string | null  // null = new person (will be created on save)
  displayName: string
  handicap: string
  isCaptain: boolean
}

function PlayerInput({
  player,
  playerIndex,
  onUpdate,
  excludePersonIds,
}: {
  player: PlayerForm
  playerIndex: number
  onUpdate: (field: keyof PlayerForm, value: string | boolean | null) => void
  excludePersonIds: string[]
}) {
  const [suggestions, setSuggestions] = useState<PersonSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function handleNameChange(value: string) {
    onUpdate("displayName", value)
    onUpdate("personId", null)

    if (value.trim().length >= 1) {
      const { data } = await supabase
        .from("people")
        .select("id, display_name")
        .ilike("display_name", `%${value.trim()}%`)
        .limit(6)

      const filtered = (data || []).filter(
        (p) => !excludePersonIds.includes(p.id)
      )
      setSuggestions(filtered)
      setOpen(true)
    } else {
      setSuggestions([])
      setOpen(false)
    }
  }

  function selectPerson(person: PersonSuggestion) {
    onUpdate("personId", person.id)
    onUpdate("displayName", person.display_name)
    setSuggestions([])
    setOpen(false)
  }

  function selectNew() {
    onUpdate("personId", null)
    setSuggestions([])
    setOpen(false)
  }

  const isConfirmed = !!player.personId || player.displayName.trim().length > 0

  return (
    <div className="grid grid-cols-[1fr_4.5rem_2.5rem] gap-2 items-start">
      {/* Name field with typeahead */}
      <div ref={wrapperRef} className="relative">
        {playerIndex === 0 && (
          <span className="block text-xs font-medium text-green-700 mb-1">Player Name</span>
        )}
        <div className={`flex items-center rounded-lg border ${player.personId ? "border-green-500 bg-green-50" : "border-green-300 bg-white"}`}>
          <input
            type="text"
            value={player.displayName}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true)
            }}
            className="flex-1 px-3 py-2.5 text-sm text-green-900 bg-transparent focus:outline-none rounded-lg"
            placeholder={`Player ${playerIndex + 1}`}
          />
          {player.personId && (
            <span className="pr-2 text-green-500 text-xs">✓</span>
          )}
        </div>

        {open && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-green-200 shadow-lg overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={() => selectPerson(s)}
                className="w-full px-3 py-2.5 text-left text-sm text-green-900 hover:bg-green-50 transition-colors"
              >
                {s.display_name}
              </button>
            ))}
            {player.displayName.trim() && !player.personId && (
              <button
                type="button"
                onMouseDown={selectNew}
                className="w-full px-3 py-2.5 text-left text-sm text-green-600 font-medium hover:bg-green-50 border-t border-green-100 transition-colors"
              >
                + Add &ldquo;{player.displayName.trim()}&rdquo; as new player
              </button>
            )}
          </div>
        )}
      </div>

      {/* Handicap */}
      <div>
        {playerIndex === 0 && (
          <span className="block text-xs font-medium text-green-700 mb-1">HCP</span>
        )}
        <input
          type="number"
          value={player.handicap}
          onChange={(e) => onUpdate("handicap", e.target.value)}
          className="w-full rounded-lg border border-green-300 px-2 py-2.5 text-sm text-center bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="0"
        />
      </div>

      {/* Captain checkbox */}
      <div className="flex flex-col items-center">
        {playerIndex === 0 && (
          <span className="block text-xs font-medium text-green-700 mb-1">Capt</span>
        )}
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
            player.isCaptain
              ? "bg-yellow-400 text-yellow-900"
              : "bg-gray-100 text-gray-400 hover:bg-yellow-50"
          }`}
          onClick={() => onUpdate("isCaptain", !player.isCaptain)}
          title={player.isCaptain ? "Captain" : "Set as captain"}
        >
          <span className="text-sm">C</span>
        </div>
      </div>

      {/* Suppress unused var warning */}
      {isConfirmed && null}
    </div>
  )
}

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
        <h2 className="text-2xl font-bold text-green-900">SuperDay Info</h2>
        <p className="text-sm text-green-700 mt-1">Basic details for this year&apos;s event.</p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-green-800">SuperDay Name</span>
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
  holes: { hole_number: number; par: number }[]
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
    <div className="flex flex-col gap-6 overflow-x-hidden">
      <div>
        <h2 className="text-2xl font-bold text-green-900">Course Setup</h2>
        <p className="text-sm text-green-700 mt-1">Enter the course name and par for each hole.</p>
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
      <div className="grid grid-cols-[1.5rem_2.5rem] gap-2 text-xs font-semibold text-green-700">
        <span className="text-left">#</span>
        <span className="text-left">Par</span>
      </div>

      {/* Hole rows */}
      <div className="flex flex-col gap-1.5">
        {holes.map((hole, i) => (
          <div
            key={hole.hole_number}
            className="grid grid-cols-[1.5rem_2.5rem] gap-2 items-center"
          >
            <span className="text-sm font-bold text-green-900 text-left">
              {hole.hole_number}
            </span>
            <select
              value={hole.par}
              onChange={(e) => updateHole(i, "par", parseInt(e.target.value))}
              className="w-full rounded-lg border border-green-300 py-2 text-sm text-center bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
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
type TeamForm = {
  name: string
  players: PlayerForm[]
}

function makeDefaultPlayers(): PlayerForm[] {
  return [
    { personId: null, displayName: "", handicap: "0", isCaptain: false },
    { personId: null, displayName: "", handicap: "0", isCaptain: false },
    { personId: null, displayName: "", handicap: "0", isCaptain: false },
    { personId: null, displayName: "", handicap: "0", isCaptain: false },
  ]
}

function TeamsStep({
  teams,
  setTeams,
  onBack,
  onSave,
  saving,
}: {
  teams: TeamForm[]
  setTeams: (t: TeamForm[]) => void
  onBack: () => void
  onSave: () => void
  saving: boolean
}) {
  const addTeam = () => {
    setTeams([...teams, { name: "", players: makeDefaultPlayers() }])
  }

  const removeTeam = (teamIndex: number) => {
    if (teams.length <= 2) return
    setTeams(teams.filter((_, i) => i !== teamIndex))
  }

  const updateTeamName = (teamIndex: number, name: string) => {
    const updated = [...teams]
    updated[teamIndex] = { ...updated[teamIndex], name }
    setTeams(updated)
  }

  const updatePlayer = (
    teamIndex: number,
    playerIndex: number,
    field: keyof PlayerForm,
    value: string | boolean | null
  ) => {
    setTeams((prev) => {
      const updated = [...prev]
      const players = [...updated[teamIndex].players]

      if (field === "isCaptain" && value === true) {
        players.forEach((p, i) => {
          players[i] = { ...p, isCaptain: i === playerIndex }
        })
      } else {
        players[playerIndex] = { ...players[playerIndex], [field]: value }
      }

      updated[teamIndex] = { ...updated[teamIndex], players }
      return updated
    })
  }

  // Collect all selected personIds across all teams to prevent duplicates
  const allSelectedPersonIds = teams
    .flatMap((t) => t.players.map((p) => p.personId))
    .filter(Boolean) as string[]

  const allTeamsValid = teams.every(
    (t) =>
      t.name &&
      t.players.every((p) => p.displayName.trim()) &&
      t.players.some((p) => p.isCaptain)
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-green-900">Teams & Players</h2>
        <p className="text-sm text-green-700 mt-1">
          Enter team names and 4 players per team. Mark one captain per team (C button). Tap a player name to search existing players.
        </p>
      </div>

      {teams.map((team, teamIndex) => {
        const captainCount = team.players.filter((p) => p.isCaptain).length
        const hasCaptain = captainCount === 1

        return (
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

            {!hasCaptain && team.players.some((p) => p.displayName.trim()) && (
              <p className="text-xs text-amber-600 font-medium -mt-1">
                Tap C on one player to mark them as captain.
              </p>
            )}

            {team.players.map((player, playerIndex) => (
              <PlayerInput
                key={playerIndex}
                player={player}
                playerIndex={playerIndex}
                onUpdate={(field, value) =>
                  updatePlayer(teamIndex, playerIndex, field, value)
                }
                excludePersonIds={allSelectedPersonIds.filter(
                  (id) => id !== player.personId
                )}
              />
            ))}
          </div>
        )
      })}

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
          {saving ? "Saving..." : "Save SuperDay"}
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
      <h2 className="text-2xl font-bold text-green-900">SuperDay Created!</h2>
      <p className="text-green-700 max-w-xs">
        Your SuperDay is all set up. You can now start entering scores when it&apos;s game time.
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
          Edit SuperDay
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
    }))
  )

  // Step 3: Teams & players
  const [teams, setTeams] = useState<TeamForm[]>([
    { name: "", players: makeDefaultPlayers() },
    { name: "", players: makeDefaultPlayers() },
  ])

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

      // 4. Create round settings
      const roundSettings = [
        { tournament_id: tournamentData.id, round_number: 1, format: "best_ball_stableford", tee_box: "white" },
        { tournament_id: tournamentData.id, round_number: 2, format: "skins", tee_box: "blue" },
        { tournament_id: tournamentData.id, round_number: 3, format: "scramble_stableford", tee_box: "red" },
      ]

      const { error: roundsError } = await supabase.from("round_settings").insert(roundSettings)
      if (roundsError) throw new Error("Failed to save round settings: " + roundsError.message)

      // 5. Create teams, find/create people, and create tournament_players
      for (let i = 0; i < teams.length; i++) {
        const team = teams[i]

        const { data: teamData, error: teamError } = await supabase
          .from("teams")
          .insert({ tournament_id: tournamentData.id, name: team.name, sort_order: i })
          .select()
          .single()

        if (teamError) throw new Error("Failed to save team: " + teamError.message)

        for (let j = 0; j < team.players.length; j++) {
          const player = team.players[j]
          let personId = player.personId

          // If no existing person was selected, create a new people record
          if (!personId) {
            const { data: newPerson, error: personError } = await supabase
              .from("people")
              .insert({ display_name: player.displayName.trim() })
              .select()
              .single()

            if (personError) throw new Error("Failed to save person: " + personError.message)
            personId = newPerson.id
          }

          // Create the tournament_players row linking person → team → tournament
          const { error: tpError } = await supabase
            .from("tournament_players")
            .insert({
              person_id: personId,
              tournament_id: tournamentData.id,
              team_id: teamData.id,
              handicap: parseInt(player.handicap) || null,
              is_captain: player.isCaptain,
              sort_order: j,
            })

          if (tpError) throw new Error("Failed to save player: " + tpError.message)
        }
      }

      setSavedTournamentId(tournamentData.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (savedTournamentId) {
    return (
      <div className="flex flex-col flex-1 bg-green-50 px-4 py-6">
        <div className="w-full max-w-2xl mx-auto">
          <SuccessScreen tournamentId={savedTournamentId} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 bg-green-50 px-4 py-6">
      <div className="w-full max-w-2xl mx-auto">
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
                <div className={`w-12 h-0.5 ${s < step ? "bg-green-500" : "bg-green-200"}`} />
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

