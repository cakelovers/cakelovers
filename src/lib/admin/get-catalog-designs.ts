import { createClient } from "@/lib/supabase/server"

export interface CatalogDesign {
  id: string
  label: string
  imageStoragePath: string
  isEnabled: boolean
  sortOrder: number
  priceAdjustmentKrw: number | null
}

// Exported so callers reading this table directly via the service-role
// client (the catalog-designs route, order submission's re-validation)
// can type their queries to match this shape without duplicating it.
export interface CatalogDesignRow {
  id: string
  label: string
  image_storage_path: string
  is_enabled: boolean
  sort_order: number
  price_adjustment_krw: number | null
}

export function mapCatalogDesignRow(row: CatalogDesignRow): CatalogDesign {
  return {
    id: row.id,
    label: row.label,
    imageStoragePath: row.image_storage_path,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
    priceAdjustmentKrw: row.price_adjustment_krw,
  }
}

// Admin-context only — reads on the caller's own session, scoped by the
// members-only RLS policy (0011). Includes disabled designs, unlike the
// customer-facing route, so the settings UI can still show and
// re-enable them. Public/customer-facing reads (the catalog-designs
// route, order submission's re-validation) go through the service-role
// client instead and filter to is_enabled themselves.
export async function getCatalogDesigns(storeId: string): Promise<CatalogDesign[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from("store_catalog_designs")
    .select("id, label, image_storage_path, is_enabled, sort_order, price_adjustment_krw")
    .eq("store_id", storeId)
    .order("sort_order")
    .returns<CatalogDesignRow[]>()

  return (data ?? []).map(mapCatalogDesignRow)
}
