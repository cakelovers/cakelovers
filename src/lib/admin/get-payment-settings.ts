import { createClient } from "@/lib/supabase/server"

// A store's bank-transfer details, read on the owner's own session so
// the members-only RLS policy on `store_payment_settings`
// (docs/15_V1_Payment_Workflow_Spec.md §6.2) is the security boundary.
// The public storefront reads the same table via the service-role client
// instead — never through this helper.
export interface StorePaymentSettings {
  bankName: string | null
  bankAccountNumber: string | null
  bankAccountHolder: string | null
  paymentInstructions: string | null
  paymentDeadlineHours: number
}

interface PaymentSettingsRow {
  bank_name: string | null
  bank_account_number: string | null
  bank_account_holder: string | null
  payment_instructions: string | null
  payment_deadline_hours: number
}

export const DEFAULT_PAYMENT_DEADLINE_HOURS = 24

export async function getPaymentSettings(
  storeId: string
): Promise<StorePaymentSettings | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from("store_payment_settings")
    .select(
      "bank_name, bank_account_number, bank_account_holder, payment_instructions, payment_deadline_hours"
    )
    .eq("store_id", storeId)
    .maybeSingle<PaymentSettingsRow>()

  if (!data) return null

  return {
    bankName: data.bank_name,
    bankAccountNumber: data.bank_account_number,
    bankAccountHolder: data.bank_account_holder,
    paymentInstructions: data.payment_instructions,
    paymentDeadlineHours: data.payment_deadline_hours ?? DEFAULT_PAYMENT_DEADLINE_HOURS,
  }
}

// The message cannot be generated without at least a bank name, account
// number, and account holder — this gates the "Copy payment message"
// button in the admin UI (docs/15 §3.3).
export function isPaymentSettingsComplete(
  settings: StorePaymentSettings | null
): settings is StorePaymentSettings {
  return Boolean(
    settings &&
      settings.bankName &&
      settings.bankAccountNumber &&
      settings.bankAccountHolder
  )
}
