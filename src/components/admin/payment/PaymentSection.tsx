import Link from "next/link"
import type { OrderStatus } from "@/lib/admin/order-status"
import { formatKrw, formatInTimeZone } from "@/lib/payments/format"
import { EnterQuoteForm } from "./EnterQuoteForm"
import { CopyPaymentMessageButton } from "./CopyPaymentMessageButton"
import { MarkAsPaidButton } from "./MarkAsPaidButton"
import { UndoPaymentButton } from "./UndoPaymentButton"
import { StartMakingButton } from "./StartMakingButton"
import { CancelOrderForm } from "./CancelOrderForm"

interface PaymentSectionProps {
  storeSlug: string
  orderId: string
  status: OrderStatus
  quotedPriceKrw: number | null
  paymentReference: string | null
  paymentRequestedAt: string | null
  paidAt: string | null
  cancellationReason: string | null
  storeTimezone: string
  settingsComplete: boolean
  // Prebuilt on the server; only non-null when status is payment_pending
  // and the store's bank settings are complete.
  paymentMessage: string | null
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export function PaymentSection({
  storeSlug,
  orderId,
  status,
  quotedPriceKrw,
  paymentReference,
  paymentRequestedAt,
  paidAt,
  cancellationReason,
  storeTimezone,
  settingsComplete,
  paymentMessage,
}: PaymentSectionProps) {
  const settingsHref = `/admin/${storeSlug}/settings`

  return (
    <section className="flex flex-col gap-3 rounded-md border p-3">
      <h2 className="font-medium">결제</h2>

      {status === "pricing_pending" && (
        <EnterQuoteForm storeSlug={storeSlug} orderId={orderId} mode="create" />
      )}

      {status === "payment_pending" && (
        <div className="flex flex-col gap-3">
          <EnterQuoteForm
            storeSlug={storeSlug}
            orderId={orderId}
            mode="edit"
            initialAmount={quotedPriceKrw}
          />

          {paymentReference && <Row label="입금자명" value={paymentReference} />}

          {!settingsComplete ? (
            <p className="text-sm text-destructive">
              결제 메시지를 만들려면 먼저{" "}
              <Link href={settingsHref} className="underline">
                설정
              </Link>
              에서 계좌 정보를 입력하세요.
            </p>
          ) : (
            paymentMessage && (
              <CopyPaymentMessageButton
                storeSlug={storeSlug}
                orderId={orderId}
                message={paymentMessage}
              />
            )
          )}

          {paymentRequestedAt && (
            <p className="text-xs text-muted-foreground">
              결제 메시지 요청함 · {formatInTimeZone(new Date(paymentRequestedAt), storeTimezone)}
              {" — "}금액을 수정하면 고객에게 새 메시지를 다시 보내야 합니다.
            </p>
          )}

          <div className="flex flex-wrap items-start gap-4 pt-1">
            <MarkAsPaidButton storeSlug={storeSlug} orderId={orderId} />
            <CancelOrderForm storeSlug={storeSlug} orderId={orderId} />
          </div>
        </div>
      )}

      {status === "paid" && (
        <div className="flex flex-col gap-3">
          <Row label="견적 금액" value={quotedPriceKrw != null ? formatKrw(quotedPriceKrw) : "—"} />
          {paidAt && (
            <Row label="입금 확인" value={formatInTimeZone(new Date(paidAt), storeTimezone)} />
          )}
          {paymentReference && <Row label="입금자명" value={paymentReference} />}
          <div className="flex flex-wrap items-start gap-4 pt-1">
            <StartMakingButton storeSlug={storeSlug} orderId={orderId} />
            <UndoPaymentButton storeSlug={storeSlug} orderId={orderId} />
          </div>
        </div>
      )}

      {(status === "making" || status === "ready" || status === "completed") && (
        <div className="flex flex-col gap-1">
          <Row label="견적 금액" value={quotedPriceKrw != null ? formatKrw(quotedPriceKrw) : "—"} />
          {paidAt && (
            <Row label="입금 확인" value={formatInTimeZone(new Date(paidAt), storeTimezone)} />
          )}
          {paymentReference && <Row label="입금자명" value={paymentReference} />}
        </div>
      )}

      {status === "cancelled" && (
        <div className="flex flex-col gap-1">
          {quotedPriceKrw != null && <Row label="견적 금액" value={formatKrw(quotedPriceKrw)} />}
          <Row label="상태" value="취소됨" />
          {cancellationReason && <Row label="취소 사유" value={cancellationReason} />}
        </div>
      )}
    </section>
  )
}
