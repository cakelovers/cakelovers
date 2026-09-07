"use client"

import { markAsPaid } from "@/app/admin/[storeSlug]/orders/[orderId]/actions"
import { ConfirmAction } from "./ConfirmAction"

export function MarkAsPaidButton({
  storeSlug,
  orderId,
}: {
  storeSlug: string
  orderId: string
}) {
  return (
    <ConfirmAction
      label="입금 확인"
      confirmPrompt="입금을 확인하셨나요? '결제 완료'로 변경되며 제작을 시작할 수 있습니다."
      confirmLabel="입금 확인"
      variant="default"
      onConfirm={() => markAsPaid(storeSlug, orderId)}
    />
  )
}
