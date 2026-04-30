"use client"

// Wrap any page in <OrganizerGuard> to restrict it to the organizer.
//
// Behaviour:
//  - Loading    → spinner (auth state is being resolved on startup)
//  - No session → redirect to /signin
//  - Signed in, but not organizer → "not authorized" screen with sign-out
//  - Organizer  → render children, plus a slim "signed in as …" bar at top

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"

export default function OrganizerGuard({ children }: { children: React.ReactNode }) {
  const { user, isOrganizer, loading, signOut } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin")
    }
  }, [loading, user, router])

  // Still resolving session on startup
  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading…</p>
      </div>
    )
  }

  // Not signed in — redirect is in flight, render nothing
  if (!user) return null

  // Signed in but not the organizer
  if (!isOrganizer) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50 px-4">
        <div className="max-w-sm w-full text-center">
          <p className="text-4xl mb-3">🔒</p>
          <h2 className="text-xl font-bold text-green-900 mb-2">Organizer only</h2>
          <p className="text-sm text-green-600 mb-1">
            {user.email} isn&apos;t set up as the organizer.
          </p>
          <p className="text-sm text-green-500 mb-6">
            Only the organizer can access this page.
          </p>
          <button
            onClick={signOut}
            className="rounded-xl border-2 border-green-300 px-6 py-3 text-sm font-semibold text-green-700 hover:bg-green-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  // Organizer — show the page with a thin identity bar at the top
  return (
    <div className="flex flex-col flex-1">
      <div className="bg-green-800 text-white px-4 py-2 flex items-center justify-between text-xs">
        <span className="text-green-300">Signed in as <span className="text-white font-medium">{user.email}</span></span>
        <button
          onClick={signOut}
          className="text-green-400 hover:text-white transition-colors font-medium"
        >
          Sign out
        </button>
      </div>
      {children}
    </div>
  )
}
