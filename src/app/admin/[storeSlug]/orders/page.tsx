import Link from "next/link"
import { redirect } from "next/navigation"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { Card, CardContent } from "@/components/ui/card"
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge"
import { formatKrw } from "@/lib/payments/format"

interface OrderListRow {
  id: string
  status: string
  pickup_date: string
  pickup_time: string
  quoted_price_krw: number | null
  ai_preview_storage_path: string
  customers: { name: string } | { name: string }[] | null
}

function customerName(row: OrderListRow): string {
  const customers = Array.isArray(row.customers) ? row.customers[0] : row.customers
  return customers?.name ?? "Unknown customer"
}

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>
}) {
  const { storeSlug } = await params
  const membership = await getStoreMembership(storeSlug)
  if (!membership) redirect("/login")

  const supabase = await createClient()
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, pickup_date, pickup_time, quoted_price_krw, ai_preview_storage_path, customers(name)")
    .eq("store_id", membership.storeId)
    .order("created_at", { ascending: false })

  const rows = (orders ?? []) as OrderListRow[]

  // Signed URLs only — bucket-level RLS isn't rolled out yet (only the
  // 5 Postgres tables' policies are, per docs/09 §7), so this is the
  // same explicitly-reviewed, server-only service-role use as the order
  // submission route. Membership above already gated who gets here.
  const thumbnailByPath = new Map<string, string>()
  if (rows.length > 0) {
    const serviceRole = createServiceRoleClient()
    const { data: signed } = await serviceRole.storage
      .from("ai-previews")
      .createSignedUrls(
        rows.map((r) => r.ai_preview_storage_path),
        3600
      )
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) thumbnailByPath.set(s.path, s.signedUrl)
    })
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">Orders</h1>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((order) => (
          <Link key={order.id} href={`/admin/${storeSlug}/orders/${order.id}`}>
            <Card>
              <CardContent className="flex items-center gap-3">
                {thumbnailByPath.get(order.ai_preview_storage_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not a static asset
                  <img
                    src={thumbnailByPath.get(order.ai_preview_storage_path)}
                    alt="Order preview"
                    className="h-14 w-14 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-medium">{customerName(order)}</div>
                  <div className="text-muted-foreground">
                    {order.pickup_date} {order.pickup_time}
                    {" · 견적 "}
                    {order.quoted_price_krw != null ? formatKrw(order.quoted_price_krw) : "—"}
                  </div>
                </div>
                <OrderStatusBadge status={order.status} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
