import Link from "next/link"
import { redirect } from "next/navigation"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import { getPaymentSettings } from "@/lib/admin/get-payment-settings"
import { getPickupSettings } from "@/lib/admin/get-pickup-settings"
import { getCakeOptions } from "@/lib/admin/get-cake-options"
import { PaymentSettingsForm } from "@/components/admin/PaymentSettingsForm"
import { PickupSettingsForm } from "@/components/admin/PickupSettingsForm"
import { CakeOptionsForm } from "@/components/admin/CakeOptionsForm"

export default async function StoreSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>
}) {
  const { storeSlug } = await params
  const membership = await getStoreMembership(storeSlug)
  if (!membership) redirect("/login")

  const [settings, pickupSettings, cakeOptions] = await Promise.all([
    getPaymentSettings(membership.storeId),
    getPickupSettings(membership.storeId),
    getCakeOptions(membership.storeId),
  ])

  return (
    <div className="flex flex-col gap-8 p-4">
      <Link
        href={`/admin/${storeSlug}/orders`}
        className="text-sm text-muted-foreground underline"
      >
        &larr; 주문 목록으로
      </Link>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">결제 설정</h1>
          <p className="text-sm text-muted-foreground">
            여기에 입력한 계좌 정보는 고객에게 보내는 결제 요청 메시지에
            포함됩니다. 견적이 발송된 이후에는 고객도 본인의 주문 페이지에서
            이 정보를 확인할 수 있습니다.
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

      <div className="flex flex-col gap-4 border-t pt-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">케이크 옵션</h1>
          <p className="text-sm text-muted-foreground">
            맛, 사이즈, 모양을 매장에 맞게 등록하세요. 등록된 옵션만 고객 주문 화면에
            표시됩니다. 옵션을 삭제하는 대신 &ldquo;사용&rdquo; 체크를 해제해 비활성화할 수
            있으며, 이미 접수된 주문에는 영향을 주지 않습니다.
          </p>
        </div>
        <CakeOptionsForm storeSlug={storeSlug} initial={cakeOptions} />
      </div>
    </div>
  )
}
