"use client"

import { undoPayment } from "@/app/admin/[storeSlug]/orders/[orderId]/actions"
import { ConfirmAction } from "./ConfirmAction"

export function UndoPaymentButton({
  storeSlug,
  orderId,
}: {
  storeSlug: string
  orderId: string
}) {
  return (
    <ConfirmAction
      label="입금 확인 취소"
      confirmPrompt="입금이 취소/반려된 경우에만 사용하세요. '입금 대기'로 되돌립니다."
      confirmLabel="되돌리기"
      variant="outline"
      size="xs"
      onConfirm={() => undoPayment(storeSlug, orderId)}
    />
  )
}
