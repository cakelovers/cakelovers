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
    case "pickup":
      return "계속하려면 픽업 날짜와 시간을 선택해 주세요."
    default:
      return null
  }
}
