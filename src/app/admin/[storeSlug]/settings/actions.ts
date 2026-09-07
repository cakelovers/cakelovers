"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import { WEEKDAY_LABELS_KO } from "@/lib/copy/weekday"

interface ActionResult {
  error?: string
  success?: true
}

export interface PaymentSettingsInput {
  bankName: string
  bankAccountNumber: string
  bankAccountHolder: string
  paymentInstructions: string
  paymentDeadlineHours: number | string
}

// Upsert the store's bank-transfer details. The members-only RLS
// policies on `store_payment_settings` (docs/15 §6.2) are the security
// boundary; `getStoreMembership` here resolves the store id and rejects
// non-members early.
export async function savePaymentSettings(
  storeSlug: string,
  values: PaymentSettingsInput
): Promise<ActionResult> {
  const membership = await getStoreMembership(storeSlug)
  if (!membership) return { error: "Not authorized." }

  const hoursRaw =
    typeof values.paymentDeadlineHours === "string"
      ? Number.parseInt(values.paymentDeadlineHours, 10)
      : values.paymentDeadlineHours
  const hours = Math.trunc(hoursRaw)
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
    return { error: "입금 기한은 1시간에서 168시간 사이여야 합니다." }
  }

  const supabase = await createClient()

  const { error } = await supabase.from("store_payment_settings").upsert(
    {
      store_id: membership.storeId,
      bank_name: values.bankName.trim() || null,
      bank_account_number: values.bankAccountNumber.trim() || null,
      bank_account_holder: values.bankAccountHolder.trim() || null,
      payment_instructions: values.paymentInstructions.trim() || null,
      payment_deadline_hours: hours,
    },
    { onConflict: "store_id" }
  )

  if (error) {
    console.error("[admin] payment settings save failed", error)
    return { error: "결제 설정을 저장하지 못했습니다. 다시 시도해 주세요." }
  }

  revalidatePath(`/admin/${storeSlug}/settings`)
  return { success: true }
}

export interface PickupDayInput {
  isEnabled: boolean
  openingTime: string
  closingTime: string
  minLeadHours: number | string
}

export interface PickupSettingsInput {
  intervalMinutes: number | string
  // Always exactly 7 entries, index === weekday (0=Sun..6=Sat).
  days: PickupDayInput[]
}

// Upserts the store-wide interval and all 7 weekday rows together, so
// a save is atomic — never a state where some days reflect the new
// form values and others don't. The members-only RLS policies on both
// tables (0007) are the security boundary; getStoreMembership here
// just resolves the store id and rejects non-members early.
export async function savePickupSettings(
  storeSlug: string,
  values: PickupSettingsInput
): Promise<ActionResult> {
  const membership = await getStoreMembership(storeSlug)
  if (!membership) return { error: "Not authorized." }

  const intervalRaw =
    typeof values.intervalMinutes === "string"
      ? Number.parseInt(values.intervalMinutes, 10)
      : values.intervalMinutes
  if (![15, 30, 60].includes(intervalRaw)) {
    return { error: "픽업 간격은 15, 30, 60분 중 하나여야 합니다." }
  }

  if (values.days.length !== 7) {
    return { error: "요일 설정이 올바르지 않습니다." }
  }

  let anyEnabled = false
  const dayRows: {
    weekday: number
    is_enabled: boolean
    opening_time: string | null
    closing_time: string | null
    min_lead_hours: number | null
  }[] = []

  for (let weekday = 0; weekday < 7; weekday++) {
    const day = values.days[weekday]

    if (!day.isEnabled) {
      dayRows.push({
        weekday,
        is_enabled: false,
        opening_time: null,
        closing_time: null,
        min_lead_hours: null,
      })
      continue
    }

    anyEnabled = true

    const leadRaw =
      typeof day.minLeadHours === "string"
        ? Number.parseInt(day.minLeadHours, 10)
        : day.minLeadHours
    if (!Number.isFinite(leadRaw) || leadRaw < 1 || leadRaw > 336) {
      return { error: `${WEEKDAY_LABELS_KO[weekday]}요일의 최소 준비 시간은 1~336시간 사이여야 합니다.` }
    }
    if (!day.openingTime || !day.closingTime) {
      return { error: `${WEEKDAY_LABELS_KO[weekday]}요일의 오픈/마감 시간을 입력해 주세요.` }
    }
    if (day.closingTime <= day.openingTime) {
      return { error: `${WEEKDAY_LABELS_KO[weekday]}요일의 마감 시간은 오픈 시간보다 늦어야 합니다.` }
    }

    dayRows.push({
      weekday,
      is_enabled: true,
      opening_time: day.openingTime,
      closing_time: day.closingTime,
      min_lead_hours: leadRaw,
    })
  }

  if (!anyEnabled) {
    return { error: "최소 하루 이상 픽업 가능 요일로 설정해야 합니다." }
  }

  const supabase = await createClient()

  const { error: intervalError } = await supabase.from("store_pickup_settings").upsert(
    { store_id: membership.storeId, pickup_interval_minutes: intervalRaw },
    { onConflict: "store_id" }
  )
  if (intervalError) {
    console.error("[admin] pickup interval save failed", intervalError)
    return { error: "픽업 설정을 저장하지 못했습니다. 다시 시도해 주세요." }
  }

  const { error: daysError } = await supabase.from("store_pickup_day_settings").upsert(
    dayRows.map((row) => ({ store_id: membership.storeId, ...row })),
    { onConflict: "store_id,weekday" }
  )
  if (daysError) {
    console.error("[admin] pickup day settings save failed", daysError)
    return { error: "픽업 설정을 저장하지 못했습니다. 다시 시도해 주세요." }
  }

  revalidatePath(`/admin/${storeSlug}/settings`)
  return { success: true }
}
