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
    case "description":
      return data.description.trim().length >= MIN_DESCRIPTION_LENGTH
    case "generate":
    case "regenerate":
      return Boolean(data.currentPreviewImage && data.currentPreviewPrompt)
    case "select":
      return Boolean(data.selectedPreviewImage && data.selectedPreviewPrompt)
    case "cakeInfo": {
      const availability = data.cakeOptionAvailability
      // Blocked until the catalog fetch resolves (success or failure) —
      // otherwise a customer who picks "메시지 없음" fast enough could
      // advance before the fetch tells us whether flavor/size/shape are
      // actually required for this store.
      if (!availability) return false
      if (availability.flavor && !data.flavorOptionId) return false
      if (availability.size && !data.sizeOptionId) return false
      if (availability.shape && !data.shapeOptionId) return false
      if (!data.cakeMessageChoice) return false
      if (data.cakeMessageChoice === "custom" && !data.cakeMessage.trim()) return false
      return true
    }
    case "pickup":
      return Boolean(data.pickupDate && data.pickupTime)
    default:
      return true
  }
}

export function stepBlockedReason(stepId: WizardStepId, data: WizardData): string | null {
  if (canLeaveStep(stepId, data)) return null
  switch (stepId) {
    case "description":
      return `케이크에 대한 설명을 ${MIN_DESCRIPTION_LENGTH}자 이상 작성해 주세요.`
    case "generate":
    case "regenerate":
      return "계속하려면 먼저 미리보기를 생성해 주세요."
    case "select":
      return "계속하려면 디자인을 선택해 주세요."
    case "cakeInfo": {
      const availability = data.cakeOptionAvailability
      if (!availability) return "케이크 옵션을 불러오는 중입니다."
      if (availability.flavor && !data.flavorOptionId) return "맛을 선택해 주세요."
      if (availability.size && !data.sizeOptionId) return "사이즈를 선택해 주세요."
      if (availability.shape && !data.shapeOptionId) return "모양을 선택해 주세요."
      if (!data.cakeMessageChoice) return "케이크 메시지 여부를 선택해 주세요."
      if (data.cakeMessageChoice === "custom" && !data.cakeMessage.trim()) {
        return "케이크에 적을 메시지를 입력해 주세요."
      }
      return null
    }
    case "pickup":
      return "계속하려면 픽업 날짜와 시간을 선택해 주세요."
    default:
      return null
  }
}
