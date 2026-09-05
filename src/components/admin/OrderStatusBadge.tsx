import { Badge } from "@/components/ui/badge"
import { formatStatusLabel } from "@/lib/admin/order-status"

export function OrderStatusBadge({ status }: { status: string }) {
  const variant = status === "cancelled" ? "destructive" : status === "completed" ? "secondary" : "default"

  return <Badge variant={variant}>{formatStatusLabel(status)}</Badge>
}
