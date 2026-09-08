import { createClient } from "@/lib/supabase/server"

export type CakeOptionKind = "flavor" | "size" | "shape"

export interface CakeOption {
  id: string
  kind: CakeOptionKind
  label: string
  isEnabled: boolean
  sortOrder: number
}

// Exported so callers reading this table directly via the service-role
// client (the cake-options route, order submission's re-validation) can
// type their queries to match this shape without duplicating it.
export interface CakeOptionRow {
  id: string
  kind: CakeOptionKind
  label: string
  is_enabled: boolean
  sort_order: number
}

export function mapCakeOptionRow(row: CakeOptionRow): CakeOption {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
  }
}

// Admin-context only — reads on the caller's own session, scoped by the
// members-only RLS policy (0009). Includes disabled options, unlike the
// customer-facing route, so the settings UI can still show and re-enable
// them. Public/customer-facing reads (the cake-options route, order
// submission's re-validation) go through the service-role client
// instead and filter to is_enabled themselves — same split already used
// for store_pickup_day_settings.
export async function getCakeOptions(storeId: string): Promise<CakeOption[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from("store_cake_options")
    .select("id, kind, label, is_enabled, sort_order")
    .eq("store_id", storeId)
    .order("kind")
    .order("sort_order")
    .returns<CakeOptionRow[]>()

  return (data ?? []).map(mapCakeOptionRow)
}
