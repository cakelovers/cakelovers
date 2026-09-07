import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { formatKrw, formatInTimeZone } from "@/lib/payments/format"
import { DEFAULT_PAYMENT_DEADLINE_HOURS } from "@/lib/admin/get-payment-settings"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AiPreviewDisclaimer } from "@/components/AiPreviewDisclaimer"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FALLBACK_TIMEZONE = "Asia/Seoul"

// Customer-facing badge copy — deliberately different from the admin
// status labels (docs/15_V1_Payment_Workflow_Spec.md §4.2).
const CUSTOMER_BADGE: Record<string, string> = {
  pricing_pending: "확인 중",
  payment_pending: "입금 대기",
  paid: "입금 확인",
  making: "제작 중",
  ready: "픽업 대기",
  completed: "완료",
  cancelled: "취소",
}

interface CustomerInfo {
  name: string
  phone: string | null
  email: string | null
}

interface StoreInfo {
  name: string
  timezone: string
}

interface TrackedOrder {
  id: string
  store_id: string
  status: string
  description: string
  customer_note: string | null
  pickup_date: string
  pickup_time: string
  ai_preview_storage_path: string
  quoted_price_krw: number | null
  payment_requested_at: string | null
  paid_at: string | null
  payment_reference: string | null
  cancellation_reason: string | null
  customers: CustomerInfo | CustomerInfo[] | null
  stores: StoreInfo | StoreInfo[] | null
}

interface PaymentSettingsRow {
  bank_name: string | null
  bank_account_number: string | null
  bank_account_holder: string | null
  payment_instructions: string | null
  payment_deadline_hours: number | null
}

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

// Public, read-only tracking page. Deliberately NOT gated by a session —
// the orderId itself (an unguessable UUID) is the access credential, so
// this works from any device/browser, not just the one that placed the
// order (see docs/03_Architecture.md §3.1 for why a session alone can't
// do this: an anonymous session never leaves its original browser).
// Uses the service-role client for exactly that reason — RLS has no way
// to authorize a request that never has anon/customer credentials at
// all. Only non-sensitive, customer-facing fields are ever selected
// here: never `internal_note`, which is staff-only.
export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params

  if (!UUID_PATTERN.test(orderId)) {
    return <NotFoundMessage />
  }

  const serviceRole = createServiceRoleClient()

  const { data: order, error } = await serviceRole
    .from("orders")
    .select(
      "id, store_id, status, description, customer_note, pickup_date, pickup_time, ai_preview_storage_path, quoted_price_krw, payment_requested_at, paid_at, payment_reference, cancellation_reason, customers(name, phone, email), stores(name, timezone)"
    )
    .eq("id", orderId)
    .maybeSingle<TrackedOrder>()

  // A real query failure (bad column, permissions, transient DB error)
  // is logged here so it's diagnosable from server logs — but still
  // shown to the customer as the same generic "not found" message as a
  // genuinely missing order, since this is a public, unauthenticated
  // page that must never leak internal error detail.
  if (error) {
    console.error("[orders/track] query failed", error)
  }

  if (!order) {
    return <NotFoundMessage />
  }

  const customer = firstOrSelf(order.customers)
  const store = firstOrSelf(order.stores)
  const timezone = store?.timezone || FALLBACK_TIMEZONE

  // Bank details only needed while a transfer is pending or just
  // confirmed. Read via service-role (same rationale as the order row).
  let paymentSettings: PaymentSettingsRow | null = null
  if (order.status === "payment_pending" || order.status === "paid") {
    const { data } = await serviceRole
      .from("store_payment_settings")
      .select(
        "bank_name, bank_account_number, bank_account_holder, payment_instructions, payment_deadline_hours"
      )
      .eq("store_id", order.store_id)
      .maybeSingle<PaymentSettingsRow>()
    paymentSettings = data ?? null
  }

  const { data: previewSigned } = await serviceRole.storage
    .from("ai-previews")
    .createSignedUrl(order.ai_preview_storage_path, 3600)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-4">
      <div>
        <p className="text-xs text-muted-foreground">{store?.name ?? "Cake order"}</p>
        <h1 className="text-lg font-semibold">Order status</h1>
      </div>

      <Badge className="w-fit">
        {CUSTOMER_BADGE[order.status] ?? order.status.replace(/_/g, " ")}
      </Badge>

      <PaymentStatusBlock order={order} settings={paymentSettings} timezone={timezone} />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Your design</h2>
        {previewSigned?.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
          <img
            src={previewSigned.signedUrl}
            alt="Your approved cake design"
            className="w-full max-w-sm rounded-md border object-cover"
          />
        ) : (
          <p className="text-sm text-muted-foreground">Preview image unavailable.</p>
        )}
        <AiPreviewDisclaimer />
      </section>

      <Card>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <span className="font-medium">Description: </span>
            {order.description}
          </div>
          {order.customer_note && (
            <div>
              <span className="font-medium">Your note: </span>
              {order.customer_note}
            </div>
          )}
          <div>
            <span className="font-medium">Pickup: </span>
            {order.pickup_date} at {order.pickup_time}
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-1">
        <h2 className="font-medium">Contact on file</h2>
        <p className="text-sm">{customer?.name ?? "—"}</p>
        {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
        {customer?.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
      </section>
    </div>
  )
}

function PaymentStatusBlock({
  order,
  settings,
  timezone,
}: {
  order: TrackedOrder
  settings: PaymentSettingsRow | null
  timezone: string
}) {
  if (order.status === "pricing_pending") {
    return (
      <p className="text-sm text-muted-foreground">
        주문이 접수되었어요. 사장님이 디자인을 확인한 뒤 견적을 알려드립니다.
      </p>
    )
  }

  if (order.status === "paid") {
    return (
      <p className="text-sm text-muted-foreground">
        입금이 확인되었습니다. 곧 제작이 시작돼요.
      </p>
    )
  }

  if (order.status === "cancelled") {
    const nonPayment =
      order.cancellation_reason != null && /입금/.test(order.cancellation_reason)
    return (
      <p className="text-sm text-muted-foreground">
        주문이 취소되었습니다.
        {nonPayment && " 입금이 확인되지 않아 취소되었습니다. 다시 주문해 주세요."}
      </p>
    )
  }

  if (order.status !== "payment_pending") {
    return null
  }

  // payment_pending — the full instructions block.
  const bankReady = Boolean(
    settings &&
      settings.bank_name &&
      settings.bank_account_number &&
      settings.bank_account_holder
  )

  if (!bankReady || order.quoted_price_krw == null) {
    return (
      <p className="text-sm text-muted-foreground">
        결제 정보 준비 중입니다. 사장님의 안내를 기다려 주세요.
      </p>
    )
  }

  const deadlineHours =
    settings?.payment_deadline_hours ?? DEFAULT_PAYMENT_DEADLINE_HOURS
  const deadlineText = order.payment_requested_at
    ? `${formatInTimeZone(
        new Date(
          new Date(order.payment_requested_at).getTime() + deadlineHours * 3_600_000
        ),
        timezone
      )}까지`
    : `${deadlineHours}시간 이내`

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div>
          <span className="font-medium">결제 금액: </span>
          {formatKrw(order.quoted_price_krw)}
        </div>
        <div>
          <span className="font-medium">입금 계좌: </span>
          {settings?.bank_name} {settings?.bank_account_number}
          <br />
          예금주: {settings?.bank_account_holder}
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="font-medium">입금자명 (중요)</div>
          <div className="text-base font-semibold">{order.payment_reference}</div>
          <div className="text-xs text-muted-foreground">
            이 이름으로 정확한 금액을 입금해 주세요. 입금자명이 다르면 확인이
            늦어질 수 있어요.
          </div>
        </div>
        <div>
          <span className="font-medium">입금 기한: </span>
          {deadlineText}
        </div>
        {settings?.payment_instructions && (
          <p className="text-muted-foreground">{settings.payment_instructions}</p>
        )}
        <p className="text-xs text-muted-foreground">
          입금 후 사장님이 확인하면 제작이 시작됩니다. 확인까지 시간이 걸릴 수
          있어요.
        </p>
      </CardContent>
    </Card>
  )
}

function NotFoundMessage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">Order not found</h1>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t find an order with that link. Double-check the link
        from your confirmation, or contact the shop directly.
      </p>
    </div>
  )
}
