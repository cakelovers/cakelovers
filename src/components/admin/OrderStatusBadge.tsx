import { Badge } from "@/components/ui/badge"
import { badgeVariantForStatus, formatStatusLabel } from "@/lib/admin/order-status"

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge variant={badgeVariantForStatus(status)}>{formatStatusLabel(status)}</Badge>
}
