import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { mapCakeOptionRow, type CakeOptionRow } from "@/lib/admin/get-cake-options"

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Public, read-only — the Cake Information step's entire data source.
// Only enabled options are returned, already grouped by kind, so a
// store with zero enabled options for a kind resolves to an empty array
// rather than the client having to infer "nothing configured" itself.
// Order submission's re-validation re-reads this same table directly
// (not through this route) to confirm a submitted option id is still
// valid at that later point in time.
//
// Reads via the service-role client: store_cake_options is members-only
// RLS (0009), and this route has no store-staff session to authorize
// against — same split already used by the pickup-slots route.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> }
) {
  const { storeSlug } = await params
  const serviceRole = createServiceRoleClient()

  const { data: store, error: storeError } = await serviceRole
    .from("stores")
    .select("id")
    .eq("slug", storeSlug)
    .eq("is_active", true)
    .maybeSingle<{ id: string }>()

  if (storeError || !store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  const { data: rows } = await serviceRole
    .from("store_cake_options")
    .select("id, kind, label, is_enabled, sort_order")
    .eq("store_id", store.id)
    .eq("is_enabled", true)
    .order("kind")
    .order("sort_order")
    .returns<CakeOptionRow[]>()

  const options = (rows ?? []).map(mapCakeOptionRow)

  return NextResponse.json({
    flavor: options.filter((o) => o.kind === "flavor"),
    size: options.filter((o) => o.kind === "size"),
    shape: options.filter((o) => o.kind === "shape"),
  })
}
