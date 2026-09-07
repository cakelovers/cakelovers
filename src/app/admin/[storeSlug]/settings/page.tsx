import Link from "next/link"
import { redirect } from "next/navigation"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import { getPaymentSettings } from "@/lib/admin/get-payment-settings"
import { PaymentSettingsForm } from "@/components/admin/PaymentSettingsForm"

export default async function StoreSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>
}) {
  const { storeSlug } = await params
  const membership = await getStoreMembership(storeSlug)
  if (!membership) redirect("/login")

  const settings = await getPaymentSettings(membership.storeId)

  return (
    <div className="flex flex-col gap-5 p-4">
      <Link
        href={`/admin/${storeSlug}/orders`}
        className="text-sm text-muted-foreground underline"
      >
        &larr; Back to orders
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Payment settings</h1>
        <p className="text-sm text-muted-foreground">
          These bank details are inserted into the payment-request message you
          send customers. The customer also sees them on their order page once a
          quote is sent.
        </p>
      </div>

      <PaymentSettingsForm storeSlug={storeSlug} initial={settings} />
    </div>
  )
}
