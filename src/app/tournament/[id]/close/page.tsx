"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
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
  const [showConfirm, setShowConfirm] = useState(false)

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

    try {
      let photoUrl: string | null = null

      if (photo) {
        const formData = new FormData()
        formData.append("file", photo)
        formData.append("tournamentId", tournamentId)

        const res = await fetch("/api/upload-photo", { method: "POST", body: formData })
        const json = await res.json()

        if (!res.ok) {
          console.error("Upload error:", json.error)
          setError(`Photo upload failed: ${json.error}`)
          setSubmitting(false)
          return
        }

        photoUrl = json.publicUrl
      }

      const res2 = await fetch("/api/close-tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          winnerTeamName: winnerName.trim(),
          winnerPoints: points ? parseFloat(points) : null,
          winnerPhotoUrl: photoUrl,
        }),
      })

      if (!res2.ok) {
        const json2 = await res2.json()
        console.error("Close error:", json2.error)
        setError(json2.error || "Something went wrong. Please try again.")
        setSubmitting(false)
        return
      }

      router.push("/")
    } catch (err) {
      console.error("Close failed:", err)
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
    }
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

          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full rounded-xl bg-green-700 py-4 text-base font-semibold text-white text-center shadow-sm hover:bg-green-800 transition-colors"
            >
              Close SuperDay
            </button>
          ) : (
            <div className="rounded-xl bg-red-50 border-2 border-red-300 p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-red-800 text-center">
                Are you sure? This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 rounded-xl border-2 border-green-700 py-3 text-sm font-semibold text-green-700 transition-colors"
                >
                  Go Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Closing..." : "Yes, Close It"}
                </button>
              </div>
            </div>
          )}

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
