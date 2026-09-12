// What must be true before the customer can leave a given wizard step —
// shared by the footer's generic Next button and the progress bar's
// step-jump, so neither can advance past a step whose requirement isn't
// met yet. Steps not listed here (references, review) have no
// leaving requirement of their own: references stays optional (0-3
// photos is a valid choice), and review is the last step.
import type { WizardData, WizardStepId } from "@/components/order-flow/types"
import { MIN_DESCRIPTION_LENGTH } from "./description"

export function canLeaveStep(stepId: WizardStepId, data: WizardData): boolean {
  switch (stepId) {
    case "cakeConfig": {
      const availability = data.cakeOptionAvailability
      // Blocked until the preset fetch resolves (success or failure) —
      // otherwise a customer who answers Lettering fast enough could
      // advance before we know whether Specification/Flavor Package
      // are actually required for this store.
      if (!availability) return false
      if (availability.specification && !data.specificationOptionId) return false
      if (availability.flavorPackage && !data.flavorPackageOptionId) return false
      if (!data.cakeMessageChoice) return false
      if (data.cakeMessageChoice === "custom" && !data.cakeMessage.trim()) return false
      return data.description.trim().length >= MIN_DESCRIPTION_LENGTH
    }
    case "aiPreview":
      return Boolean(data.selectedPreviewImage && data.selectedPreviewPrompt)
    case "pickup":
      return Boolean(data.pickupDate && data.pickupTime)
    default:
      return true
  }
}

export function stepBlockedReason(stepId: WizardStepId, data: WizardData): string | null {
  if (canLeaveStep(stepId, data)) return null
  switch (stepId) {
    case "cakeConfig": {
      const availability = data.cakeOptionAvailability
      if (!availability) return "케이크 옵션을 불러오는 중입니다."
      if (availability.specification && !data.specificationOptionId) return "규격을 선택해 주세요."
      if (availability.flavorPackage && !data.flavorPackageOptionId) return "맛 패키지를 선택해 주세요."
      if (!data.cakeMessageChoice) return "케이크 메시지 여부를 선택해 주세요."
      if (data.cakeMessageChoice === "custom" && !data.cakeMessage.trim()) {
        return "케이크에 적을 메시지를 입력해 주세요."
      }
      return `케이크에 대한 설명을 ${MIN_DESCRIPTION_LENGTH}자 이상 작성해 주세요.`
    }
    case "aiPreview":
      return "계속하려면 디자인을 선택해 주세요."
    case "pickup":
      return "계속하려면 픽업 날짜와 시간을 선택해 주세요."
    default:
      return null
  }
}
