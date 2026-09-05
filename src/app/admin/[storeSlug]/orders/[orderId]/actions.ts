"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { VALID_STATUS_TRANSITIONS, type OrderStatus } from "@/lib/admin/order-status"

interface ActionResult {
  error?: string
  success?: true
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

  revalidatePath(`/admin/${storeSlug}/orders`)
  revalidatePath(`/admin/${storeSlug}/orders/${orderId}`)
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
