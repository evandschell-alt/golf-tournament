"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import OrganizerGuard from "@/components/OrganizerGuard"

type PersonRow = {
  id: string
  display_name: string
  created_at: string
  tournament_count: number
}

export default function PeoplePage() {
  return (
    <OrganizerGuard>
      <PeopleContent />
    </OrganizerGuard>
  )
}

function PeopleContent() {
  const [people, setPeople] = useState<PersonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [saving, setSaving] = useState(false)

  // Merge state
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<string[]>([])
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)

  async function fetchPeople() {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from("people")
      .select("id, display_name, created_at, tournament_players(id)")
      .order("display_name")

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setPeople(
        (data || []).map((p: { id: string; display_name: string; created_at: string; tournament_players: { id: string }[] }) => ({
          id: p.id,
          display_name: p.display_name,
          created_at: p.created_at,
          tournament_count: (p.tournament_players || []).length,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPeople()
  }, [])

  async function saveName(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    const { error: updateError } = await supabase
      .from("people")
      .update({ display_name: editName.trim() })
      .eq("id", id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setPeople((prev) =>
        prev.map((p) => (p.id === id ? { ...p, display_name: editName.trim() } : p))
      )
      setEditingId(null)
    }
    setSaving(false)
  }

  async function deletePerson(id: string) {
    const person = people.find((p) => p.id === id)
    if (!person) return
    if (person.tournament_count > 0) {
      setError("Cannot delete a player who has participated in tournaments.")
      return
    }

    const { error: deleteError } = await supabase.from("people").delete().eq("id", id)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      setPeople((prev) => prev.filter((p) => p.id !== id))
    }
  }

  function toggleMergeSelect(id: string) {
    setMergeSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return prev  // max 2
      return [...prev, id]
    })
    setMergeError(null)
  }

  async function executeMerge(keepId: string) {
    const deleteId = mergeSelected.find((id) => id !== keepId)
    if (!deleteId) return

    setMerging(true)
    setMergeError(null)

    // Check for tournament conflicts (same person in same tournament)
    const { data: keepTps } = await supabase
      .from("tournament_players")
      .select("tournament_id")
      .eq("person_id", keepId)

    const { data: deleteTps } = await supabase
      .from("tournament_players")
      .select("tournament_id")
      .eq("person_id", deleteId)

    const keepTournaments = new Set((keepTps || []).map((r: { tournament_id: string }) => r.tournament_id))
    const conflict = (deleteTps || []).some((r: { tournament_id: string }) => keepTournaments.has(r.tournament_id))

    if (conflict) {
      setMergeError("These two players both appear in the same tournament — can't merge them.")
      setMerging(false)
      return
    }

    // Repoint tournament_players rows to the keeper
    const { error: updateError } = await supabase
      .from("tournament_players")
      .update({ person_id: keepId })
      .eq("person_id", deleteId)

    if (updateError) {
      setMergeError(updateError.message)
      setMerging(false)
      return
    }

    // Delete the duplicate
    const { error: deleteError } = await supabase.from("people").delete().eq("id", deleteId)
    if (deleteError) {
      setMergeError(deleteError.message)
      setMerging(false)
      return
    }

    setMergeMode(false)
    setMergeSelected([])
    setMerging(false)
    await fetchPeople()
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading...</p>
      </div>
    )
  }

  const selectedPeople = people.filter((p) => mergeSelected.includes(p.id))

  return (
    <div className="flex flex-col flex-1 bg-green-50 px-4 py-6">
      <div className="w-full max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-green-600 hover:text-green-800 mb-4 inline-block">
          &larr; Back to Home
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-green-900">Players</h1>
            <p className="text-sm text-green-600 mt-1">{people.length} people across all SuperDays</p>
          </div>
          <button
            onClick={() => {
              setMergeMode(!mergeMode)
              setMergeSelected([])
              setMergeError(null)
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              mergeMode
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            {mergeMode ? "Cancel Merge" : "Merge Duplicates"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">✕</button>
          </div>
        )}

        {mergeMode && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {mergeSelected.length === 0 && "Select two players to merge (e.g. duplicate names)."}
            {mergeSelected.length === 1 && "Now select the second player."}
            {mergeSelected.length === 2 && (
              <div className="flex flex-col gap-2">
                <p className="font-medium">
                  Merging <strong>{selectedPeople[0]?.display_name}</strong> and <strong>{selectedPeople[1]?.display_name}</strong>. Which name should be kept?
                </p>
                {mergeError && <p className="text-red-600">{mergeError}</p>}
                <div className="flex gap-2">
                  {selectedPeople.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => executeMerge(p.id)}
                      disabled={merging}
                      className="flex-1 rounded-lg bg-amber-500 text-white py-2 text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                    >
                      {merging ? "Merging..." : `Keep "${p.display_name}"`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {people.length === 0 ? (
          <div className="rounded-xl bg-white border border-green-200 p-8 text-center">
            <p className="text-green-600">No players yet.</p>
            <p className="text-sm text-green-500 mt-1">Players are created when you set up a tournament.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {people.map((person) => {
              const isSelected = mergeSelected.includes(person.id)
              const isEditing = editingId === person.id

              return (
                <div
                  key={person.id}
                  className={`rounded-xl bg-white border-2 p-4 transition-colors ${
                    mergeMode
                      ? isSelected
                        ? "border-amber-400 bg-amber-50"
                        : "border-green-200 hover:border-amber-300 cursor-pointer"
                      : "border-green-200"
                  }`}
                  onClick={() => mergeMode && toggleMergeSelect(person.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    {isEditing ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveName(person.id)
                            if (e.key === "Escape") setEditingId(null)
                          }}
                          autoFocus
                          className="flex-1 rounded-lg border border-green-300 px-3 py-1.5 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); saveName(person.id) }}
                          disabled={saving}
                          className="rounded-lg bg-green-700 text-white px-3 py-1.5 text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors"
                        >
                          {saving ? "..." : "Save"}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                          className="rounded-lg border border-green-300 text-green-700 px-3 py-1.5 text-sm hover:bg-green-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          {mergeMode && (
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? "border-amber-500 bg-amber-500" : "border-gray-300"
                            }`}>
                              {isSelected && <span className="text-white text-xs">✓</span>}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-green-900">{person.display_name}</p>
                            <p className="text-xs text-green-500">
                              {person.tournament_count === 0
                                ? "No tournaments"
                                : `${person.tournament_count} SuperDay${person.tournament_count !== 1 ? "s" : ""}`}
                            </p>
                          </div>
                        </div>

                        {!mergeMode && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingId(person.id)
                                setEditName(person.display_name)
                              }}
                              className="text-green-400 hover:text-green-600 p-1 transition-colors"
                              title="Edit name"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65z" />
                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                              </svg>
                            </button>
                            {person.tournament_count === 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (confirm(`Delete ${person.display_name}?`)) {
                                    deletePerson(person.id)
                                  }
                                }}
                                className="text-red-300 hover:text-red-500 p-1 transition-colors"
                                title="Delete player"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
