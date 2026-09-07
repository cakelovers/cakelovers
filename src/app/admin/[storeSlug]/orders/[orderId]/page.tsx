import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import {
  getPaymentSettings,
  isPaymentSettingsComplete,
  DEFAULT_PAYMENT_DEADLINE_HOURS,
} from "@/lib/admin/get-payment-settings"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import type { OrderStatus } from "@/lib/admin/order-status"
import { buildPaymentMessage } from "@/lib/payments/payment-message"
import { getSiteUrl } from "@/lib/site-url"
import { StatusUpdateForm } from "@/components/admin/StatusUpdateForm"
import { InternalNoteForm } from "@/components/admin/InternalNoteForm"
import { PaymentSection } from "@/components/admin/payment/PaymentSection"

const FALLBACK_TIMEZONE = "Asia/Seoul"

interface CustomerInfo {
  name: string
  phone: string | null
  email: string | null
}

interface StoreInfo {
  timezone: string
}

interface OrderDetailRow {
  id: string
  description: string
  status: OrderStatus
  pickup_date: string
  pickup_time: string
  ai_preview_storage_path: string
  internal_note: string | null
  customer_note: string | null
  quoted_price_krw: number | null
  payment_requested_at: string | null
  paid_at: string | null
  payment_reference: string | null
  cancellation_reason: string | null
  customers: CustomerInfo | CustomerInfo[] | null
  stores: StoreInfo | StoreInfo[] | null
}

interface ReferenceImageRow {
  id: string
  storage_path: string
  position: number
}

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ storeSlug: string; orderId: string }>
}) {
  const { storeSlug, orderId } = await params
  const membership = await getStoreMembership(storeSlug)
  if (!membership) redirect("/login")

  const supabase = await createClient()

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, description, status, pickup_date, pickup_time, ai_preview_storage_path, internal_note, customer_note, quoted_price_krw, payment_requested_at, paid_at, payment_reference, cancellation_reason, customers(name, phone, email), stores(timezone)"
    )
    .eq("id", orderId)
    .eq("store_id", membership.storeId)
    .maybeSingle<OrderDetailRow>()

  if (!order) notFound()

  const { data: referenceImages } = await supabase
    .from("reference_images")
    .select("id, storage_path, position")
    .eq("order_id", orderId)
    .order("position")

  const refRows = (referenceImages ?? []) as ReferenceImageRow[]
  const customer = firstOrSelf(order.customers)
  const store = firstOrSelf(order.stores)
  const storeTimezone = store?.timezone || FALLBACK_TIMEZONE

  // --- Payment message (built server-side, handed to the copy button) ---
  const paymentSettings = await getPaymentSettings(membership.storeId)
  const settingsComplete = isPaymentSettingsComplete(paymentSettings)
  const deadlineHours =
    paymentSettings?.paymentDeadlineHours ?? DEFAULT_PAYMENT_DEADLINE_HOURS

  let paymentMessage: string | null = null
  if (
    order.status === "payment_pending" &&
    settingsComplete &&
    order.quoted_price_krw != null &&
    order.payment_reference
  ) {
    const deadlineBase = order.payment_requested_at
      ? new Date(order.payment_requested_at)
      : new Date()
    const deadlineAt = new Date(deadlineBase.getTime() + deadlineHours * 3_600_000)

    paymentMessage = buildPaymentMessage({
      storeName: membership.storeName,
      customerName: customer?.name ?? "고객",
      description: order.description,
      pickupDate: order.pickup_date,
      pickupTime: order.pickup_time,
      amountKrw: order.quoted_price_krw,
      paymentReference: order.payment_reference,
      bankName: paymentSettings.bankName ?? "",
      bankAccountNumber: paymentSettings.bankAccountNumber ?? "",
      bankAccountHolder: paymentSettings.bankAccountHolder ?? "",
      paymentInstructions: paymentSettings.paymentInstructions,
      deadlineHours,
      deadlineAt,
      storeTimezone,
      orderUrl: `${await getSiteUrl()}/orders/${order.id}`,
    })
  }

  // Service-role client used only for generating signed display URLs —
  // see the same note in orders/page.tsx and docs from Phase 3 on why
  // (no bucket-level RLS policies exist yet).
  const serviceRole = createServiceRoleClient()

  const { data: previewSigned } = await serviceRole.storage
    .from("ai-previews")
    .createSignedUrl(order.ai_preview_storage_path, 3600)

  const referenceSignedByPath = new Map<string, string>()
  if (refRows.length > 0) {
    const { data: signed } = await serviceRole.storage
      .from("reference-images")
      .createSignedUrls(
        refRows.map((r) => r.storage_path),
        3600
      )
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) referenceSignedByPath.set(s.path, s.signedUrl)
    })
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <Link href={`/admin/${storeSlug}/orders`} className="text-sm text-muted-foreground underline">
        &larr; 주문 목록으로
      </Link>

      <StatusUpdateForm storeSlug={storeSlug} orderId={orderId} currentStatus={order.status} />

      <PaymentSection
        storeSlug={storeSlug}
        orderId={orderId}
        status={order.status}
        quotedPriceKrw={order.quoted_price_krw}
        paymentReference={order.payment_reference}
        paymentRequestedAt={order.payment_requested_at}
        paidAt={order.paid_at}
        cancellationReason={order.cancellation_reason}
        storeTimezone={storeTimezone}
        settingsComplete={settingsComplete}
        paymentMessage={paymentMessage}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">AI 생성 디자인 (고객 승인 완료)</h2>
        {previewSigned?.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
          <img
            src={previewSigned.signedUrl}
            alt="고객이 승인한 AI 케이크 디자인"
            className="w-full max-w-sm rounded-md border object-cover"
          />
        ) : (
          <p className="text-sm text-muted-foreground">미리보기 이미지를 불러올 수 없습니다.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">참고 사진 (제작 참고용)</h2>
        <p className="text-xs text-muted-foreground">
          디자인이 아니라 제작을 돕기 위한 참고 자료입니다.
        </p>
        {refRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 참고 사진이 없습니다.</p>
        ) : (
          <div className="flex gap-2">
            {refRows.map((ref) => {
              const url = referenceSignedByPath.get(ref.storage_path)
              return url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
                <img
                  key={ref.id}
                  src={url}
                  alt={`참고 사진 ${ref.position}`}
                  className="h-24 w-24 rounded-md border object-cover"
                />
              ) : null
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-medium">설명</h2>
        <p className="text-sm">{order.description}</p>
      </section>

      {order.customer_note && (
        <section className="flex flex-col gap-1">
          <h2 className="font-medium">고객 메모</h2>
          <p className="text-sm">{order.customer_note}</p>
        </section>
      )}

      <section className="flex flex-col gap-1">
        <h2 className="font-medium">고객</h2>
        <p className="text-sm">{customer?.name ?? "알 수 없음"}</p>
        {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
        {customer?.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-medium">픽업</h2>
        <p className="text-sm">
          {order.pickup_date} {order.pickup_time}
        </p>
      </section>

      <InternalNoteForm storeSlug={storeSlug} orderId={orderId} initialNote={order.internal_note ?? ""} />
    </div>
  )
}
