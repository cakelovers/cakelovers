import Link from "next/link"
import { redirect } from "next/navigation"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import { getPaymentSettings } from "@/lib/admin/get-payment-settings"
import { getPickupSettings } from "@/lib/admin/get-pickup-settings"
import { PaymentSettingsForm } from "@/components/admin/PaymentSettingsForm"
import { PickupSettingsForm } from "@/components/admin/PickupSettingsForm"

export default async function StoreSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>
}) {
  const { storeSlug } = await params
  const membership = await getStoreMembership(storeSlug)
  if (!membership) redirect("/login")

  const [settings, pickupSettings] = await Promise.all([
    getPaymentSettings(membership.storeId),
    getPickupSettings(membership.storeId),
  ])

  return (
    <div className="flex flex-col gap-8 p-4">
      <Link
        href={`/admin/${storeSlug}/orders`}
        className="text-sm text-muted-foreground underline"
      >
        &larr; Back to orders
      </Link>

      <div className="flex flex-col gap-4">
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

      <div className="flex flex-col gap-4 border-t pt-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">픽업 설정</h1>
          <p className="text-sm text-muted-foreground">
            요일별로 픽업 가능 여부, 운영 시간, 최소 준비 시간을 설정합니다.
            고객이 주문 시 선택할 수 있는 픽업 시간에 바로 반영됩니다.
          </p>
        </div>
        <PickupSettingsForm storeSlug={storeSlug} initial={pickupSettings} />
      </div>
    </div>
  )
}
