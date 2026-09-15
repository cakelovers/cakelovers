import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { mapCatalogDesignRow, type CatalogDesignRow } from "@/lib/admin/get-catalog-designs"

const PREVIEW_BUCKET = "ai-previews"
const SIGNED_URL_TTL_SECONDS = 3600

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Public, read-only — BrowseStep's entire data source for Direct Mode.
// Only enabled designs are returned. Order submission's re-validation
// re-reads this same table directly (not through this route) to
// confirm a submitted design id is still valid at that later point in
// time — same split already established for cake-options.
//
// Reads via the service-role client: store_catalog_designs is
// members-only RLS (0011), and this route has no store-staff session
// to authorize against — same pattern as cake-options and pickup-slots.
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

  const { data: rows, error: rowsError } = await serviceRole
    .from("store_catalog_designs")
    .select("id, label, image_storage_path, is_enabled, sort_order, price_adjustment_krw")
    .eq("store_id", store.id)
    .eq("is_enabled", true)
    .order("sort_order")
    .returns<CatalogDesignRow[]>()

  if (rowsError) {
    console.error("[catalog-designs] lookup failed", rowsError)
    return errorResponse(500, "catalog_designs_load_failed", "인기 디자인을 불러오지 못했습니다.")
  }

  const designs = (rows ?? []).map(mapCatalogDesignRow)

  // Images live in the private "ai-previews" bucket (same bucket
  // generated previews use — no separate storage for catalog images),
  // so the client needs signed URLs, not raw storage paths.
  const signedDesigns = await Promise.all(
    designs.map(async (design) => {
      const { data: signed } = await serviceRole.storage
        .from(PREVIEW_BUCKET)
        .createSignedUrl(design.imageStoragePath, SIGNED_URL_TTL_SECONDS)
      return {
        id: design.id,
        label: design.label,
        imageUrl: signed?.signedUrl ?? null,
        priceAdjustmentKrw: design.priceAdjustmentKrw,
      }
    })
  )

  return NextResponse.json({
    designs: signedDesigns.filter((design) => design.imageUrl !== null),
  })
}
