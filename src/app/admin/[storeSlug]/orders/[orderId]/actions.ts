"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import { VALID_STATUS_TRANSITIONS, type OrderStatus } from "@/lib/admin/order-status"
import { buildPaymentReference } from "@/lib/payments/payment-reference"

interface ActionResult {
  error?: string
  success?: true
}

const NON_TERMINAL_STATUSES: OrderStatus[] = [
  "pricing_pending",
  "payment_pending",
  "paid",
  "making",
  "ready",
]

function revalidateOrder(storeSlug: string, orderId: string) {
  revalidatePath(`/admin/${storeSlug}/orders`)
  revalidatePath(`/admin/${storeSlug}/orders/${orderId}`)
}

// The RLS "staff can update their store's orders" policy (docs/09 §7)
// is the real security boundary here — this transition check is a
// workflow guard on top of it, preventing an arbitrary jump like
// completed -> new even though RLS would technically allow it.
export async function updateOrderStatus(
  storeSlug: string,
  orderId: string,
  newStatus: OrderStatus
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle()

  if (fetchError || !order) {
    return { error: "Order not found." }
  }

  const currentStatus = order.status as OrderStatus
  const allowedNext = VALID_STATUS_TRANSITIONS[currentStatus] ?? []

  if (currentStatus !== newStatus && !allowedNext.includes(newStatus)) {
    return { error: `Cannot move from "${currentStatus}" to "${newStatus}".` }
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId)

  if (updateError) {
    console.error("[admin] status update failed", updateError)
    return { error: "Could not update order status. Please try again." }
  }

  revalidateOrder(storeSlug, orderId)
  return { success: true }
}

export async function updateInternalNote(
  storeSlug: string,
  orderId: string,
  note: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("orders")
    .update({ internal_note: note.trim() || null })
    .eq("id", orderId)

  if (error) {
    console.error("[admin] internal note update failed", error)
    return { error: "Could not save the note. Please try again." }
  }

  revalidatePath(`/admin/${storeSlug}/orders/${orderId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// V1 payment workflow — docs/15_V1_Payment_Workflow_Spec.md §3
// ---------------------------------------------------------------------------

interface CustomerNameRow {
  name: string
}

interface PaymentOrderRow {
  status: OrderStatus
  payment_requested_at: string | null
  customers: CustomerNameRow | CustomerNameRow[] | null
}

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function parseAmountKrw(raw: number | string): number | null {
  const value = typeof raw === "string" ? Number.parseInt(raw.replace(/[^\d]/g, ""), 10) : raw
  if (!Number.isInteger(value) || value <= 0) return null
  return value
}

// Enter the first quote: writes the price, computes the stable payment
// reference, and moves the order pricing_pending -> payment_pending.
export async function setQuote(
  storeSlug: string,
  orderId: string,
  amountKrwInput: number | string
): Promise<ActionResult> {
  const membership = await getStoreMembership(storeSlug)
  if (!membership) return { error: "Not authorized." }

  const amountKrw = parseAmountKrw(amountKrwInput)
  if (amountKrw === null) {
    return { error: "견적 금액을 0보다 큰 숫자로 입력하세요." }
  }

  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("status, payment_requested_at, customers(name)")
    .eq("id", orderId)
    .eq("store_id", membership.storeId)
    .maybeSingle<PaymentOrderRow>()

  if (fetchError || !order) return { error: "Order not found." }
  if (order.status !== "pricing_pending") {
    return { error: `"${order.status}" 상태에서는 견적을 처음 입력할 수 없습니다.` }
  }

  const customer = firstOrSelf(order.customers)
  const reference = buildPaymentReference(customer?.name ?? "고객", orderId)

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      quoted_price_krw: amountKrw,
      payment_reference: reference,
      status: "payment_pending",
    })
    .eq("id", orderId)
    .eq("store_id", membership.storeId)

  if (updateError) {
    console.error("[admin] setQuote failed", updateError)
    return { error: "견적을 저장하지 못했습니다. 다시 시도해 주세요." }
  }

  revalidateOrder(storeSlug, orderId)
  return { success: true }
}

// Correct a quote before payment. Does not change status and does not
// touch payment_reference or payment_requested_at.
export async function updateQuote(
  storeSlug: string,
  orderId: string,
  amountKrwInput: number | string
): Promise<ActionResult> {
  const membership = await getStoreMembership(storeSlug)
  if (!membership) return { error: "Not authorized." }

  const amountKrw = parseAmountKrw(amountKrwInput)
  if (amountKrw === null) {
    return { error: "견적 금액을 0보다 큰 숫자로 입력하세요." }
  }

  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("store_id", membership.storeId)
    .maybeSingle<{ status: OrderStatus }>()

  if (fetchError || !order) return { error: "Order not found." }
  if (order.status !== "payment_pending") {
    return { error: `"${order.status}" 상태에서는 견적을 수정할 수 없습니다.` }
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ quoted_price_krw: amountKrw })
    .eq("id", orderId)
    .eq("store_id", membership.storeId)

  if (updateError) {
    console.error("[admin] updateQuote failed", updateError)
    return { error: "견적을 수정하지 못했습니다. 다시 시도해 주세요." }
  }

  revalidateOrder(storeSlug, orderId)
  return { success: true }
}

// Stamp payment_requested_at the first time the owner copies the payment
// message. Subsequent copies are a no-op success.
export async function markPaymentRequested(
  storeSlug: string,
  orderId: string
): Promise<ActionResult> {
  const membership = await getStoreMembership(storeSlug)
  if (!membership) return { error: "Not authorized." }

  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("status, payment_requested_at")
    .eq("id", orderId)
    .eq("store_id", membership.storeId)
    .maybeSingle<{ status: OrderStatus; payment_requested_at: string | null }>()

  if (fetchError || !order) return { error: "Order not found." }
  if (order.status !== "payment_pending") {
    return { error: "입금 대기 상태의 주문만 결제 요청을 기록할 수 있습니다." }
  }
  if (order.payment_requested_at) return { success: true }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ payment_requested_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("store_id", membership.storeId)

  if (updateError) {
    console.error("[admin] markPaymentRequested failed", updateError)
    return { error: "결제 요청 시각을 기록하지 못했습니다." }
  }

  revalidateOrder(storeSlug, orderId)
  return { success: true }
}

// Manual payment confirmation: payment_pending -> paid, stamping who
// confirmed it and when.
export async function markAsPaid(
  storeSlug: string,
  orderId: string
): Promise<ActionResult> {
  const membership = await getStoreMembership(storeSlug)
  if (!membership) return { error: "Not authorized." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authorized." }

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("store_id", membership.storeId)
    .maybeSingle<{ status: OrderStatus }>()

  if (fetchError || !order) return { error: "Order not found." }
  if (order.status !== "payment_pending") {
    return { error: "입금 대기 상태의 주문만 입금 확인할 수 있습니다." }
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_confirmed_by: user.id,
    })
    .eq("id", orderId)
    .eq("store_id", membership.storeId)

  if (updateError) {
    console.error("[admin] markAsPaid failed", updateError)
    return { error: "입금 확인을 저장하지 못했습니다. 다시 시도해 주세요." }
  }

  revalidateOrder(storeSlug, orderId)
  return { success: true }
}

// Undo a mistaken/bounced payment confirmation: paid -> payment_pending,
// clearing the paid_* stamps.
export async function undoPayment(
  storeSlug: string,
  orderId: string
): Promise<ActionResult> {
  const membership = await getStoreMembership(storeSlug)
  if (!membership) return { error: "Not authorized." }

  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("store_id", membership.storeId)
    .maybeSingle<{ status: OrderStatus }>()

  if (fetchError || !order) return { error: "Order not found." }
  if (order.status !== "paid") {
    return { error: "결제 완료 상태의 주문만 되돌릴 수 있습니다." }
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "payment_pending", paid_at: null, paid_confirmed_by: null })
    .eq("id", orderId)
    .eq("store_id", membership.storeId)

  if (updateError) {
    console.error("[admin] undoPayment failed", updateError)
    return { error: "결제 상태를 되돌리지 못했습니다. 다시 시도해 주세요." }
  }

  revalidateOrder(storeSlug, orderId)
  return { success: true }
}

// Cancel from any non-terminal state, capturing an optional free-text
// reason (e.g. 미입금).
export async function cancelOrder(
  storeSlug: string,
  orderId: string,
  reason: string
): Promise<ActionResult> {
  const membership = await getStoreMembership(storeSlug)
  if (!membership) return { error: "Not authorized." }

  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("store_id", membership.storeId)
    .maybeSingle<{ status: OrderStatus }>()

  if (fetchError || !order) return { error: "Order not found." }
  if (!NON_TERMINAL_STATUSES.includes(order.status)) {
    return { error: "이미 종료된 주문입니다." }
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancellation_reason: reason.trim() || null,
    })
    .eq("id", orderId)
    .eq("store_id", membership.storeId)

  if (updateError) {
    console.error("[admin] cancelOrder failed", updateError)
    return { error: "주문을 취소하지 못했습니다. 다시 시도해 주세요." }
  }

  revalidateOrder(storeSlug, orderId)
  return { success: true }
}
