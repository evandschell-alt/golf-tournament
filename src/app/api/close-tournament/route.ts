import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const body = await request.json()
    const { tournamentId, winnerTeamName, winnerPoints, winnerPhotoUrl } = body

    if (!tournamentId || !winnerTeamName) {
      return NextResponse.json({ error: "Missing tournamentId or winnerTeamName" }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from("tournaments")
      .update({
        is_locked: true,
        winner_team_name: winnerTeamName,
        winner_points: winnerPoints ?? null,
        winner_photo_url: winnerPhotoUrl ?? null,
      })
      .eq("id", tournamentId)

    if (error) {
      console.error("Close tournament error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Close tournament unexpected error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
