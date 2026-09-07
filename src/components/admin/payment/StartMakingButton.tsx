"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { updateOrderStatus } from "@/app/admin/[storeSlug]/orders/[orderId]/actions"

// Convenience button for the happy path off `paid`. The status dropdown
// can also make this move; this is just the primary affordance.
export function StartMakingButton({
  storeSlug,
  orderId,
}: {
  storeSlug: string
  orderId: string
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      onClick={() =>
        startTransition(async () => {
          await updateOrderStatus(storeSlug, orderId, "making")
        })
      }
      disabled={isPending}
    >
      {isPending ? "처리 중…" : "제작 시작"}
    </Button>
  )
}
