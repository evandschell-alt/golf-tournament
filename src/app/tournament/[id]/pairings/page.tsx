"use client"

import { useState, useEffect, use } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import OrganizerGuard from "@/components/OrganizerGuard"

type Player = {
  id: string
  name: string
  team_id: string
}

type Team = {
  id: string
  name: string
  players: Player[]
}

type Group = {
  group_number: number
  team_a_id: string
  team_b_id: string
  team_a_players: (Player | null)[]
  team_b_players: (Player | null)[]
}

export default function PairingsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <OrganizerGuard>
      <PairingsContent params={params} />
    </OrganizerGuard>
  )
}

function PairingsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params)
  const [teams, setTeams] = useState<Team[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tournamentName, setTournamentName] = useState("")

  useEffect(() => {
    const fetchData = async () => {
      // Fetch tournament info
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("name, year")
        .eq("id", tournamentId)
        .single()

      if (tournament) {
        setTournamentName(`${tournament.name} ${tournament.year}`)
      }

      // Fetch teams and players
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name, sort_order, tournament_players(id, sort_order, people(display_name))")
        .eq("tournament_id", tournamentId)
        .order("sort_order")

      if (!teamsData || teamsData.length < 2) {
        setError("Need at least 2 teams to set up pairings.")
        setLoading(false)
        return
      }

      // Sort players within each team and flatten name from people
      const sortedTeams = teamsData.map((t) => ({
        ...t,
        players: (t.tournament_players || [])
          .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((tp: any) => ({
            id: tp.id as string,
            name: tp.people.display_name as string,
            sort_order: tp.sort_order as number,
            team_id: t.id,
          })),
      }))

      setTeams(sortedTeams)

      // Check for existing pairings
      const { data: existingPairings } = await supabase
        .from("r2_pairings")
        .select("id, group_number, player_id")
        .eq("tournament_id", tournamentId)

      if (existingPairings && existingPairings.length > 0) {
        // Rebuild groups from existing pairings
        const allPlayers = sortedTeams.flatMap((t: Team) =>
          t.players.map((p: Player) => ({ ...p, team_id: t.id }))
        )
        const maxGroup = Math.max(...existingPairings.map((p) => p.group_number))
        const loadedGroups: Group[] = []

        for (let g = 1; g <= maxGroup; g++) {
          const groupPairings = existingPairings.filter((p) => p.group_number === g)
          const groupPlayers = groupPairings
            .map((p) => allPlayers.find((ap: Player) => ap.id === p.player_id))
            .filter(Boolean) as Player[]

          // Figure out which two teams are in this group
          const teamIds = [...new Set(groupPlayers.map((p) => p.team_id))]
          if (teamIds.length === 2) {
            loadedGroups.push({
              group_number: g,
              team_a_id: teamIds[0],
              team_b_id: teamIds[1],
              team_a_players: [
                groupPlayers.find((p) => p.team_id === teamIds[0]) || null,
                groupPlayers.filter((p) => p.team_id === teamIds[0])[1] || null,
              ],
              team_b_players: [
                groupPlayers.find((p) => p.team_id === teamIds[1]) || null,
                groupPlayers.filter((p) => p.team_id === teamIds[1])[1] || null,
              ],
            })
          }
        }

        if (loadedGroups.length > 0) {
          setGroups(loadedGroups)
          setSaved(true)
          setLoading(false)
          return
        }
      }

      // Generate default groups based on team count
      const newGroups = generateDefaultGroups(sortedTeams)
      setGroups(newGroups)
      setLoading(false)
    }

    fetchData()
  }, [tournamentId])

  // Generate the right number of groups based on team count
  function generateDefaultGroups(teamList: Team[]): Group[] {
    if (teamList.length === 2) {
      // 2 teams → 2 foursomes
      return [
        {
          group_number: 1,
          team_a_id: teamList[0].id,
          team_b_id: teamList[1].id,
          team_a_players: [null, null],
          team_b_players: [null, null],
        },
        {
          group_number: 2,
          team_a_id: teamList[0].id,
          team_b_id: teamList[1].id,
          team_a_players: [null, null],
          team_b_players: [null, null],
        },
      ]
    } else {
      // 3 teams → 3 foursomes (each team plays each other team)
      return [
        {
          group_number: 1,
          team_a_id: teamList[0].id,
          team_b_id: teamList[1].id,
          team_a_players: [null, null],
          team_b_players: [null, null],
        },
        {
          group_number: 2,
          team_a_id: teamList[1].id,
          team_b_id: teamList[2].id,
          team_a_players: [null, null],
          team_b_players: [null, null],
        },
        {
          group_number: 3,
          team_a_id: teamList[0].id,
          team_b_id: teamList[2].id,
          team_a_players: [null, null],
          team_b_players: [null, null],
        },
      ]
    }
  }

  // Get all players already assigned to any group
  function getAssignedPlayerIds(): Set<string> {
    const ids = new Set<string>()
    groups.forEach((g) => {
      g.team_a_players.forEach((p) => { if (p) ids.add(p.id) })
      g.team_b_players.forEach((p) => { if (p) ids.add(p.id) })
    })
    return ids
  }

  // Get available players for a given team (not yet assigned)
  function getAvailablePlayers(teamId: string): Player[] {
    const assigned = getAssignedPlayerIds()
    const team = teams.find((t) => t.id === teamId)
    if (!team) return []
    return team.players.filter((p) => !assigned.has(p.id))
  }

  // Assign a player to a group slot
  function assignPlayer(
    groupIndex: number,
    side: "a" | "b",
    slotIndex: number,
    playerId: string | ""
  ) {
    const updated = [...groups]
    const group = { ...updated[groupIndex] }
    const key = side === "a" ? "team_a_players" : "team_b_players"
    const players = [...group[key]]

    if (playerId === "") {
      players[slotIndex] = null
    } else {
      const teamId = side === "a" ? group.team_a_id : group.team_b_id
      const team = teams.find((t) => t.id === teamId)
      const player = team?.players.find((p) => p.id === playerId) || null
      players[slotIndex] = player
    }

    group[key] = players
    updated[groupIndex] = group
    setGroups(updated)
    setSaved(false)
  }

  // Check if all slots are filled
  function allSlotsFilled(): boolean {
    return groups.every(
      (g) =>
        g.team_a_players.every((p) => p !== null) &&
        g.team_b_players.every((p) => p !== null)
    )
  }

  // Save pairings to database
  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      // Delete existing pairings
      await supabase
        .from("r2_pairings")
        .delete()
        .eq("tournament_id", tournamentId)

      // Insert new pairings
      const pairings: { tournament_id: string; group_number: number; player_id: string }[] = []

      groups.forEach((g) => {
        g.team_a_players.forEach((p) => {
          if (p) pairings.push({ tournament_id: tournamentId, group_number: g.group_number, player_id: p.id })
        })
        g.team_b_players.forEach((p) => {
          if (p) pairings.push({ tournament_id: tournamentId, group_number: g.group_number, player_id: p.id })
        })
      })

      const { error: insertError } = await supabase.from("r2_pairings").insert(pairings)
      if (insertError) throw new Error(insertError.message)

      setSaved(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save pairings"
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  function getTeamName(teamId: string): string {
    return teams.find((t) => t.id === teamId)?.name || "Team"
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50 px-4">
        <p className="text-green-600">Loading pairings...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 bg-green-50 px-4 py-6">
      <div className="w-full max-w-2xl mx-auto">
        <Link
          href="/"
          className="text-sm text-green-600 hover:text-green-800 mb-4 inline-block"
        >
          &larr; Back to Home
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-green-900">Round 2 Pairings</h1>
          <p className="text-sm text-green-700 mt-1">{tournamentName}</p>
          <p className="text-sm text-green-600 mt-2">
            Assign 2 players from each team to each foursome group. Each group is a head-to-head skins match between the two pairs.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {saved && (
          <div className="mb-4 rounded-lg bg-green-100 border border-green-300 p-3 text-sm text-green-800">
            Pairings saved!
          </div>
        )}

        <div className="flex flex-col gap-6">
          {groups.map((group, groupIndex) => (
            <div
              key={group.group_number}
              className="rounded-xl bg-white border-2 border-green-200 p-4"
            >
              <h3 className="font-bold text-green-900 text-lg mb-4">
                Group {group.group_number}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Team A side */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                    {getTeamName(group.team_a_id)}
                  </span>
                  {group.team_a_players.map((player, slotIndex) => (
                    <select
                      key={`a-${slotIndex}`}
                      value={player?.id || ""}
                      onChange={(e) => assignPlayer(groupIndex, "a", slotIndex, e.target.value)}
                      className="rounded-lg border border-green-300 px-3 py-3 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Select player...</option>
                      {/* Show currently selected player + available ones */}
                      {player && (
                        <option value={player.id}>{player.name}</option>
                      )}
                      {getAvailablePlayers(group.team_a_id).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>

                {/* VS divider */}
                <div className="hidden sm:flex items-center justify-center text-green-400 font-bold text-sm absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />

                {/* Team B side */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                    {getTeamName(group.team_b_id)}
                  </span>
                  {group.team_b_players.map((player, slotIndex) => (
                    <select
                      key={`b-${slotIndex}`}
                      value={player?.id || ""}
                      onChange={(e) => assignPlayer(groupIndex, "b", slotIndex, e.target.value)}
                      className="rounded-lg border border-green-300 px-3 py-3 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Select player...</option>
                      {player && (
                        <option value={player.id}>{player.name}</option>
                      )}
                      {getAvailablePlayers(group.team_b_id).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>

              {/* VS label for mobile */}
              <div className="sm:hidden flex justify-center -mt-2 -mb-2">
                <span className="text-xs font-bold text-green-400 bg-white px-2">vs</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <Link
            href="/"
            className="flex-1 rounded-xl border-2 border-green-700 py-4 text-base font-semibold text-green-700 text-center hover:bg-green-50 transition-colors"
          >
            Back
          </Link>
          <button
            onClick={handleSave}
            disabled={!allSlotsFilled() || saving}
            className="flex-1 rounded-xl bg-green-700 py-4 text-base font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save Pairings"}
          </button>
        </div>
      </div>
    </div>
  )
}
