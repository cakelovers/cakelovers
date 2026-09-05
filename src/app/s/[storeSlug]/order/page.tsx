import { OrderWizard } from "@/components/order-flow/OrderWizard"

// Scaffold-only route: no store lookup, no Supabase call yet — the
// wizard shell renders with mock data regardless of the slug.
export default async function OrderPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>
}) {
  const { storeSlug } = await params

  return <OrderWizard storeSlug={storeSlug} />
}
