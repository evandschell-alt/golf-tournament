"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import OrganizerGuard from "@/components/OrganizerGuard"

function isHeic(file: File) {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name)
  )
}

export default function CloseTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <OrganizerGuard>
      <CloseContent params={params} />
    </OrganizerGuard>
  )
}

function CloseContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params)
  const router = useRouter()

  const [winnerName, setWinnerName] = useState("")
  const [points, setPoints] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    let finalFile = file
    if (isHeic(file)) {
      try {
        const heic2any = (await import("heic2any")).default
        const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 })
        const blob = Array.isArray(converted) ? converted[0] : converted
        finalFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" })
      } catch (convErr) {
        console.error("HEIC conversion failed:", convErr)
        setError("Could not process this photo format. Please try a different photo.")
        return
      }
    }

    setPhoto(finalFile)
    const reader = new FileReader()
    reader.onloadend = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(finalFile)
  }

  const handleSubmit = async () => {
    if (!winnerName.trim()) {
      setError("Please enter the winning team name.")
      return
    }

    setSubmitting(true)
    setError(null)

    let photoUrl: string | null = null

    if (photo) {
      const ext = photo.name.split(".").pop() || "jpg"
      const path = `winners/${tournamentId}/winner.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("tournament-photos")
        .upload(path, photo, { upsert: true, contentType: photo.type || "image/jpeg" })

      if (uploadError) {
        console.error("Supabase upload error:", uploadError)
        setError(`Photo upload failed: ${uploadError.message}`)
        setSubmitting(false)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from("tournament-photos")
        .getPublicUrl(path)

      photoUrl = publicUrl
    }

    const { error: updateError } = await supabase
      .from("tournaments")
      .update({
        is_locked: true,
        winner_team_name: winnerName.trim(),
        winner_points: points ? parseFloat(points) : null,
        winner_photo_url: photoUrl,
      })
      .eq("id", tournamentId)

    if (updateError) {
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
      return
    }

    router.push("/")
  }

  return (
    <div className="flex flex-col flex-1 bg-green-50 px-4 py-8">
      <div className="w-full max-w-md mx-auto">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-green-900">Close SuperDay</h1>
          <p className="text-sm text-green-600 mt-1">
            Record the final results and move this event to the archive.
          </p>
        </div>

        <div className="flex flex-col gap-4">

          {/* Winning team */}
          <div className="rounded-xl bg-white border border-green-200 p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                Winning Team
              </span>
              <input
                type="text"
                value={winnerName}
                onChange={(e) => setWinnerName(e.target.value)}
                placeholder="e.g. Team Eagle"
                className="rounded-lg border border-green-300 px-3 py-2 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
          </div>

          {/* Total points */}
          <div className="rounded-xl bg-white border border-green-200 p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                Winning Points Total
              </span>
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                placeholder="e.g. 42.5"
                step="0.5"
                min="0"
                className="rounded-lg border border-green-300 px-3 py-2 text-sm bg-white text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </label>
          </div>

          {/* Team photo */}
          <div className="rounded-xl bg-white border border-green-200 p-4">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-3">
              Winning Team Photo
            </p>

            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-52 object-cover rounded-lg"
                />
                <button
                  onClick={() => { setPhoto(null); setPhotoPreview(null) }}
                  className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-white rounded-full shadow text-green-500 hover:text-red-500 transition-colors text-sm font-bold"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 h-36 border-2 border-dashed border-green-200 rounded-lg cursor-pointer hover:bg-green-50 transition-colors">
                <span className="text-3xl">📸</span>
                <span className="text-sm font-medium text-green-600">Tap to add a photo</span>
                <span className="text-xs text-green-400">Appears on the archive card</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center px-2">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-xl bg-green-700 py-4 text-base font-semibold text-white text-center shadow-sm hover:bg-green-800 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Closing SuperDay..." : "Close SuperDay"}
          </button>

          <button
            onClick={() => router.back()}
            className="w-full py-3 text-sm font-medium text-green-600 hover:text-green-800 transition-colors"
          >
            Cancel
          </button>

        </div>
      </div>
    </div>
  )
}
