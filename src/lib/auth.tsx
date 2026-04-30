"use client"

// Auth context for the whole app.
// Tracks who is signed in, whether they're the organizer, and
// exposes a signOut function. Wrap the app in <AuthProvider> once
// (done in ClientProviders.tsx) and then call useAuth() anywhere.

import { createContext, useContext, useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "./supabase"

type AuthContextType = {
  user: User | null          // null = not signed in
  isOrganizer: boolean       // true = signed in AND has is_organizer flag
  loading: boolean           // true while we're checking the session on startup
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isOrganizer: false,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isOrganizer, setIsOrganizer] = useState(false)
  const [loading, setLoading] = useState(true)

  // Look up whether this user's email is flagged as organizer in the people table
  async function resolveOrganizer(u: User | null) {
    if (!u?.email) {
      setIsOrganizer(false)
      return
    }
    const { data } = await supabase
      .from("people")
      .select("id")
      .eq("email", u.email)
      .eq("is_organizer", true)
      .maybeSingle()
    setIsOrganizer(!!data)
  }

  useEffect(() => {
    // Check for an existing session on mount (handles page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      resolveOrganizer(u).finally(() => setLoading(false))
    })

    // Keep state in sync if the user signs in/out in another tab
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null
        setUser(u)
        resolveOrganizer(u)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    // onAuthStateChange fires after this and clears user/isOrganizer
  }

  return (
    <AuthContext.Provider value={{ user, isOrganizer, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
