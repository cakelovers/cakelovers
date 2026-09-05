import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import type { OrderStatus } from "@/lib/admin/order-status"
import { StatusUpdateForm } from "@/components/admin/StatusUpdateForm"
import { InternalNoteForm } from "@/components/admin/InternalNoteForm"

interface CustomerInfo {
  name: string
  phone: string | null
  email: string | null
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
  customers: CustomerInfo | CustomerInfo[] | null
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
      "id, description, status, pickup_date, pickup_time, ai_preview_storage_path, internal_note, customer_note, customers(name, phone, email)"
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
        &larr; Back to orders
      </Link>

      <StatusUpdateForm storeSlug={storeSlug} orderId={orderId} currentStatus={order.status} />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">AI-generated design (customer-approved)</h2>
        {previewSigned?.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
          <img
            src={previewSigned.signedUrl}
            alt="Customer-approved AI cake design"
            className="w-full max-w-sm rounded-md border object-cover"
          />
        ) : (
          <p className="text-sm text-muted-foreground">Preview image unavailable.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Reference photos (production reference only)</h2>
        <p className="text-xs text-muted-foreground">
          These are not the design — production aids only.
        </p>
        {refRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reference photos provided.</p>
        ) : (
          <div className="flex gap-2">
            {refRows.map((ref) => {
              const url = referenceSignedByPath.get(ref.storage_path)
              return url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
                <img
                  key={ref.id}
                  src={url}
                  alt={`Reference photo ${ref.position}`}
                  className="h-24 w-24 rounded-md border object-cover"
                />
              ) : null
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-medium">Description</h2>
        <p className="text-sm">{order.description}</p>
      </section>

      {order.customer_note && (
        <section className="flex flex-col gap-1">
          <h2 className="font-medium">Customer note</h2>
          <p className="text-sm">{order.customer_note}</p>
        </section>
      )}

      <section className="flex flex-col gap-1">
        <h2 className="font-medium">Customer</h2>
        <p className="text-sm">{customer?.name ?? "Unknown"}</p>
        {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
        {customer?.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-medium">Pickup</h2>
        <p className="text-sm">
          {order.pickup_date} at {order.pickup_time}
        </p>
      </section>

      <InternalNoteForm storeSlug={storeSlug} orderId={orderId} initialNote={order.internal_note ?? ""} />
    </div>
  )
}
