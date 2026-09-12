import type { CakeOptionKind } from "@/lib/admin/get-cake-options"

// Shared between the admin catalog UI and its server actions' error
// messages, so the two can't drift out of sync with each other.
export const CAKE_OPTION_KIND_LABELS_KO: Record<CakeOptionKind, string> = {
  specification: "규격",
  flavor_package: "맛 패키지",
}

export const MAX_CAKE_OPTION_LABEL_LENGTH = 30

// Shown wherever a price-adjustment hint appears (both option pickers,
// plus the review page) so a customer never mistakes the per-option
// hints for a calculated total — there is no pricing engine; the store
// always quotes the final amount manually after reviewing the order.
export const PRICE_ADJUSTMENT_DISCLAIMER_LINE1_KO = "💡 표시된 추가금은 참고용입니다."
export const PRICE_ADJUSTMENT_DISCLAIMER_LINE2_KO =
  "최종 금액은 주문 내용을 확인한 후 매장에서 안내드립니다."
