"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cancelOrder } from "@/app/admin/[storeSlug]/orders/[orderId]/actions"
import { ConfirmAction } from "./ConfirmAction"

export function CancelOrderForm({
  storeSlug,
  orderId,
}: {
  storeSlug: string
  orderId: string
}) {
  const [reason, setReason] = useState("")

  return (
    <ConfirmAction
      label="주문 취소"
      confirmPrompt="이 주문을 취소하시겠어요?"
      confirmLabel="주문 취소"
      variant="destructive"
      size="sm"
      onConfirm={() => cancelOrder(storeSlug, orderId, reason)}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cancel-reason">취소 사유 (선택)</Label>
        <Input
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 미입금"
          className="max-w-xs"
        />
      </div>
    </ConfirmAction>
  )
}
