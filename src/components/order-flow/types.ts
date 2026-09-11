// Shared types for the customer order wizard shell.
// Mock/shell phase only — no Supabase or OpenAI types here yet.

export interface ReferenceImageSlot {
  file: File
  previewUrl: string
}

export interface WizardData {
  description: string
  // The most recently generated/regenerated candidate — replaced on
  // every call, never itself persisted anywhere (see docs/11 §0.4).
  currentPreviewImage: string | null
  currentPreviewPrompt: string | null
  // The customer's chosen candidate — this is what eventually gets
  // written to `orders.ai_preview_storage_path` / `ai_preview_prompt`
  // at submit time, in a later phase.
  selectedPreviewImage: string | null
  selectedPreviewPrompt: string | null
  referenceImages: (ReferenceImageSlot | null)[]
  pickupDate: string
  pickupTime: string
  name: string
  phone: string
  // Optional production instructions for the shop, distinct from the
  // design `description` — e.g. "no candles needed" or "reduce
  // sweetness if possible". Shown to both staff and the customer.
  customerNote: string
  // Required before submission — see /privacy. The server stamps its
  // own timestamp on `orders.privacy_consent_given_at`; this flag only
  // gates the client-side submit button.
  privacyConsentAccepted: boolean
}

export const WIZARD_STEPS = [
  { id: "description", label: "설명" },
  { id: "generate", label: "AI 미리보기" },
  { id: "regenerate", label: "다시 생성" },
  { id: "select", label: "디자인 선택" },
  { id: "references", label: "참고 사진" },
  { id: "pickup", label: "픽업" },
  { id: "review", label: "검토 및 제출" },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"]
