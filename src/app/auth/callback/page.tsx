"use client"

// After Google OAuth, Supabase redirects here with a ?code= param.
// We exchange that code for a session, then send the user home.

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get("code")
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(() => {
        router.replace("/")
      })
    } else {
      // No code — just go home (handles edge cases)
      router.replace("/")
    }
  }, [router, searchParams])

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
      <p className="text-green-600">Signing you in…</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1 items-center justify-center bg-green-50">
          <p className="text-green-600">Loading…</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  )
}
