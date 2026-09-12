import type { CakeOptionKind } from "@/lib/admin/get-cake-options"

// Shared between the admin catalog UI and its server actions' error
// messages, so the two can't drift out of sync with each other.
export const CAKE_OPTION_KIND_LABELS_KO: Record<CakeOptionKind, string> = {
  specification: "규격",
  flavor_package: "맛 패키지",
}

export const MAX_CAKE_OPTION_LABEL_LENGTH = 30
