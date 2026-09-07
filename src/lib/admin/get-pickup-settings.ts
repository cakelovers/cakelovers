import { createClient } from "@/lib/supabase/server"

export interface PickupDaySettings {
  weekday: number // 0=Sun..6=Sat
  isEnabled: boolean
  openingTime: string | null // "HH:MM"
  closingTime: string | null // "HH:MM"
  minLeadHours: number | null
}

export interface PickupSettings {
  intervalMinutes: number
  // Always exactly 7 entries, index === weekday.
  days: PickupDaySettings[]
}

// Exported so callers reading these tables directly via the
// service-role client (the pickup-slots route, order submission) can
// type their queries to match resolvePickupSettings()'s parameters
// exactly, without duplicating these shapes.
export interface PickupSettingsRow {
  pickup_interval_minutes: number
}

export interface PickupDaySettingsRow {
  weekday: number
  is_enabled: boolean
  opening_time: string | null
  closing_time: string | null
  min_lead_hours: number | null
}

export const DEFAULT_PICKUP_INTERVAL_MINUTES = 30

const DEFAULT_DAY: Omit<PickupDaySettings, "weekday"> = {
  isEnabled: true,
  openingTime: "11:00",
  closingTime: "18:00",
  minLeadHours: 12,
}

export const DEFAULT_PICKUP_SETTINGS: PickupSettings = {
  intervalMinutes: DEFAULT_PICKUP_INTERVAL_MINUTES,
  days: Array.from({ length: 7 }, (_, weekday) => ({ weekday, ...DEFAULT_DAY })),
}

// Fills in defaults for any missing day row and a missing interval
// row, so "not yet configured" resolves identically everywhere this
// is called from — the admin settings form, the customer picker's
// server-side slot source, and the order API's final validation.
export function resolvePickupSettings(
  intervalRow: PickupSettingsRow | null,
  dayRows: PickupDaySettingsRow[]
): PickupSettings {
  const byWeekday = new Map(dayRows.map((row) => [row.weekday, row]))

  const days: PickupDaySettings[] = Array.from({ length: 7 }, (_, weekday) => {
    const row = byWeekday.get(weekday)
    if (!row) return { weekday, ...DEFAULT_DAY }
    return {
      weekday,
      isEnabled: row.is_enabled,
      openingTime: row.opening_time,
      closingTime: row.closing_time,
      minLeadHours: row.min_lead_hours,
    }
  })

  return {
    intervalMinutes: intervalRow?.pickup_interval_minutes ?? DEFAULT_PICKUP_INTERVAL_MINUTES,
    days,
  }
}

// Admin-context only — reads on the caller's own session, scoped by
// the members-only RLS policies on both tables (0007). Public/
// customer-facing reads (the pickup-slots route, order submission) go
// through the service-role client instead and call
// resolvePickupSettings() directly on the raw rows — same split
// already used for store_payment_settings.
export async function getPickupSettings(storeId: string): Promise<PickupSettings> {
  const supabase = await createClient()

  const [{ data: intervalRow }, { data: dayRows }] = await Promise.all([
    supabase
      .from("store_pickup_settings")
      .select("pickup_interval_minutes")
      .eq("store_id", storeId)
      .maybeSingle<PickupSettingsRow>(),
    supabase
      .from("store_pickup_day_settings")
      .select("weekday, is_enabled, opening_time, closing_time, min_lead_hours")
      .eq("store_id", storeId)
      .returns<PickupDaySettingsRow[]>(),
  ])

  return resolvePickupSettings(intervalRow, dayRows ?? [])
}
