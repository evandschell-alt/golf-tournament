"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

export default function SignInPage() {
  const { user, isOrganizer, loading } = useAuth()
  const router = useRouter()

  // If already signed in as organizer, skip straight to home
  useEffect(() => {
    if (!loading && user && isOrganizer) {
      router.replace("/")
    }
  }, [user, isOrganizer, loading, router])

  async function handleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
        <p className="text-green-600">Loading...</p>
      </div>
    )
  }

  // Show "not organizer" message if they signed in but aren't flagged
  const showNotOrganizer = user && !isOrganizer

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-4">⛳</div>
        <h1 className="text-3xl font-bold text-green-900 mb-1" style={{ fontFamily: "var(--font-dancing-script)" }}>
          SuperDay
        </h1>
        <p className="text-sm text-green-600 mb-10">Organizer access</p>

        {showNotOrganizer ? (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-red-800 mb-1">Not authorized</p>
            <p className="text-sm text-red-600">
              {user.email} isn&apos;t set up as the organizer. Sign in with the right Google account, or ask the organizer to set your email in the database.
            </p>
            <button
              onClick={() => supabase.auth.signOut()}
              className="mt-3 text-sm text-red-500 underline hover:text-red-700"
            >
              Sign out and try again
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            className="w-full rounded-xl bg-white border-2 border-green-200 py-4 px-6 text-base font-semibold text-green-900 shadow-sm hover:border-green-400 hover:shadow-md transition-all flex items-center justify-center gap-3"
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        )}

        <p className="text-xs text-green-400 mt-6">
          Spectators don&apos;t need an account — just share the leaderboard link.
        </p>
      </div>
    </div>
  )
}
