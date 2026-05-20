import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  // Admin client — bypasses all RLS
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const tournamentId = formData.get("tournamentId") as string | null

  if (!file || !tournamentId) {
    return NextResponse.json({ error: "Missing file or tournamentId" }, { status: 400 })
  }

  const ext = file.name.split(".").pop() || "jpg"
  const path = `winners/${tournamentId}/winner-${Date.now()}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from("tournament-photos")
    .upload(path, file, { contentType: file.type || "image/jpeg" })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from("tournament-photos")
    .getPublicUrl(path)

  return NextResponse.json({ publicUrl })
}
