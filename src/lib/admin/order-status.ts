// Shared between the status-update Server Action and the client-side
// dropdown so the two never define the workflow differently.
//
// V1 payment workflow lifecycle (docs/15_V1_Payment_Workflow_Spec.md §2):
//   pricing_pending -> payment_pending -> paid -> making -> ready -> completed
// with `cancelled` reachable from any non-terminal state, plus two
// documented one-step-back corrections (paid -> payment_pending for a
// bounced transfer, making -> paid for a mistaken start).
export const ORDER_STATUSES = [
  "pricing_pending",
  "payment_pending",
  "paid",
  "making",
  "ready",
  "completed",
  "cancelled",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

// Linear forward progression with cancellation from any active state,
// plus the two one-step-back corrections from docs/14 §1 / docs/15 §2.2.
// The transitions `pricing_pending -> payment_pending` and
// `payment_pending -> paid` are permitted here (so the state machine is
// consistent and manual correction is possible) but are driven in the UI
// by the dedicated "Enter quote" and "Mark as paid" actions, never the
// status dropdown — see docs/15 §2.3.
export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pricing_pending: ["payment_pending", "cancelled"],
  payment_pending: ["paid", "cancelled"],
  paid: ["making", "payment_pending", "cancelled"],
  making: ["ready", "paid", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
}

// Which of the allowed transitions the status dropdown should surface
// (docs/15 §2.3). Two targets are owned by dedicated actions and must
// never be reachable from the dropdown:
//
//   • `payment_pending` — the forward move is the *Enter quote* action;
//     the backward move (from `paid`) is the *Undo payment* action,
//     which also clears `paid_at` / `paid_confirmed_by` (invariant
//     §2.4.3). A bare status write from the dropdown would leave those
//     stamps stale, so it is never offered.
//   • `paid` as a *forward* target from `payment_pending` — that is the
//     *Mark as paid* action. It IS still offered as the documented
//     one-step-back from `making` ("started by mistake", §2.2), which
//     needs no field cleanup.
export function dropdownStatusOptions(current: OrderStatus): OrderStatus[] {
  const next = VALID_STATUS_TRANSITIONS[current] ?? []
  const options = [current, ...next].filter((status) => {
    if (status === current) return true
    if (status === "payment_pending") return false
    if (status === "paid" && current === "payment_pending") return false
    return true
  })
  // de-dupe while preserving order
  return [...new Set(options)]
}

// Korean labels — the single place status text is localized. The
// customer-facing page has its own bespoke badge copy (docs/15 §4.2);
// this map is what the admin dashboard's status dropdown and badge
// render via formatStatusLabel() below.
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pricing_pending: "견적 대기",
  payment_pending: "입금 대기",
  paid: "결제 완료",
  making: "제작 중",
  ready: "픽업 대기",
  completed: "완료",
  cancelled: "취소",
}

export function formatStatusLabel(status: string): string {
  return STATUS_LABELS[status as OrderStatus] ?? status.replace(/_/g, " ")
}
