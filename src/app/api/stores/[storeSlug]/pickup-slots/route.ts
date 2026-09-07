import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import {
  resolvePickupSettings,
  type PickupSettingsRow,
  type PickupDaySettingsRow,
} from "@/lib/admin/get-pickup-settings"
import { findEligibleDays, nowInTimeZone } from "@/lib/validation/pickup"

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Public, read-only — the customer picker's entire data source.
// Slot eligibility is computed here, server-side, so the client never
// has to reimplement "what counts as a valid pickup time"; it only
// ever renders what this returns, and the order API's final
// validation (orders/route.ts) uses the exact same computeEligibleDays
// / isPickupSlotValid functions against the same settings.
//
// Uses findEligibleDays (not a fixed 14-day window) so a store with a
// long lead time relative to 14 days doesn't hand the customer a
// picker with nothing open and no explanation — see pickup.ts.
//
// Reads via the service-role client: pickup settings are members-only
// RLS (0007), and this route has no store-staff session to authorize
// against — same split already used for the public order-tracking
// page's read of store_payment_settings.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> }
) {
  const { storeSlug } = await params
  const serviceRole = createServiceRoleClient()

  const { data: store, error: storeError } = await serviceRole
    .from("stores")
    .select("id, timezone")
    .eq("slug", storeSlug)
    .eq("is_active", true)
    .maybeSingle<{ id: string; timezone: string }>()

  if (storeError || !store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  const [{ data: intervalRow }, { data: dayRows }] = await Promise.all([
    serviceRole
      .from("store_pickup_settings")
      .select("pickup_interval_minutes")
      .eq("store_id", store.id)
      .maybeSingle<PickupSettingsRow>(),
    serviceRole
      .from("store_pickup_day_settings")
      .select("weekday, is_enabled, opening_time, closing_time, min_lead_hours")
      .eq("store_id", store.id)
      .returns<PickupDaySettingsRow[]>(),
  ])

  const settings = resolvePickupSettings(intervalRow, dayRows ?? [])
  const now = nowInTimeZone(store.timezone)
  const days = findEligibleDays(settings, now)

  return NextResponse.json({ days, intervalMinutes: settings.intervalMinutes })
}
