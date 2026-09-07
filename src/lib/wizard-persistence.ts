// Lightweight resume-after-refresh support for the customer order
// wizard. Deliberately persists only small, plain-text fields —
// description, pickup selection, and contact info. The AI preview
// image, reference photos, and consent are never written here: images
// are too large (and, for reference photos, unserializable File
// objects) for sessionStorage, and consent must always be freshly
// re-affirmed, never silently restored from a prior session.
export interface WizardDraft {
  description: string
  pickupDate: string
  pickupTime: string
  name: string
  phone: string
  email: string
  customerNote: string
}

function draftKey(storeSlug: string): string {
  return `cakelovers-wizard-draft:${storeSlug}`
}

export function saveDraft(storeSlug: string, draft: WizardDraft): void {
  try {
    sessionStorage.setItem(draftKey(storeSlug), JSON.stringify(draft))
  } catch {
    // Storage unavailable (private browsing, quota, disabled) —
    // resuming is a convenience, not a requirement, so fail silently.
  }
}

export function loadDraft(storeSlug: string): WizardDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(storeSlug))
    if (!raw) return null
    return JSON.parse(raw) as WizardDraft
  } catch {
    return null
  }
}

export function clearDraft(storeSlug: string): void {
  try {
    sessionStorage.removeItem(draftKey(storeSlug))
  } catch {
    // Nothing to clean up if storage isn't available.
  }
}
