// Shared between the status-update Server Action and the client-side
// dropdown so the two never define the workflow differently.
export const ORDER_STATUSES = [
  "new",
  "in_progress",
  "ready",
  "completed",
  "cancelled",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

// Linear forward progression, with cancellation reachable from any
// active (not-yet-completed) state. Matches docs/03_Architecture.md §5:
// "a simple linear guard in MVP — no arbitrary jumps."
export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["in_progress", "cancelled"],
  in_progress: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
}

export function formatStatusLabel(status: string): string {
  return status.replace("_", " ")
}
