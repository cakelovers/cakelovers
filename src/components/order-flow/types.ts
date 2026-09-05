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
  email: string
  // Optional production instructions for the shop, distinct from the
  // design `description` — e.g. "no candles needed" or "reduce
  // sweetness if possible". Shown to both staff and the customer.
  customerNote: string
}

export const WIZARD_STEPS = [
  { id: "description", label: "Description" },
  { id: "generate", label: "AI Preview" },
  { id: "regenerate", label: "Regenerate" },
  { id: "select", label: "Select Design" },
  { id: "references", label: "Reference Photos" },
  { id: "pickup", label: "Pickup" },
  { id: "review", label: "Review & Submit" },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"]
