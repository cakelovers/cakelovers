// Server-only. Matches the MIME allowlist and 5MB size limit configured
// on the `reference-images` Storage bucket itself (see
// docs/09_Supabase_Execution_Checklist.md §4) — validated here too so a
// rejected file gets a clear message instead of an opaque Storage error.

export const MAX_REFERENCE_IMAGES = 3
export const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
}

export function extensionForMimeType(mimeType: string): string | null {
  return EXTENSION_BY_MIME_TYPE[mimeType] ?? null
}
