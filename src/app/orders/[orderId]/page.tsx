import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { formatStatusLabel } from "@/lib/admin/order-status"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CustomerInfo {
  name: string
  phone: string | null
  email: string | null
}

interface StoreInfo {
  name: string
}

interface TrackedOrder {
  id: string
  status: string
  description: string
  customer_note: string | null
  pickup_date: string
  pickup_time: string
  ai_preview_storage_path: string
  customers: CustomerInfo | CustomerInfo[] | null
  stores: StoreInfo | StoreInfo[] | null
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
      "id, status, description, customer_note, pickup_date, pickup_time, ai_preview_storage_path, customers(name, phone, email), stores(name)"
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

  const { data: previewSigned } = await serviceRole.storage
    .from("ai-previews")
    .createSignedUrl(order.ai_preview_storage_path, 3600)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-4">
      <div>
        <p className="text-xs text-muted-foreground">{store?.name ?? "Cake order"}</p>
        <h1 className="text-lg font-semibold">Order status</h1>
      </div>

      <Badge className="w-fit">{formatStatusLabel(order.status)}</Badge>

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
