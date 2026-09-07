"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getStoreMembership } from "@/lib/admin/get-store-membership"

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
