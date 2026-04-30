"use client"

// Thin wrapper so we can use client-side providers (AuthProvider)
// inside the server-component root layout.

import { AuthProvider } from "@/lib/auth"

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
