// Server-only. Matches the MIME allowlist configured on the
// `reference-images` Storage bucket itself (see
// docs/09_Supabase_Execution_Checklist.md §4) — validated here too so a
// rejected file gets a clear message instead of an opaque Storage error.
//
// Size limit: capped below Vercel's hard 4.5MB serverless function
// request-body ceiling, not just under the bucket's own setting — a
// single reference photo at the previously-configured 5MB would have
// exceeded that platform limit on its own, before even reaching this
// validation. Up to 3 of these still travel in one multipart request
// alongside the rest of the order fields, so this alone doesn't
// guarantee staying under the ceiling with multiple large photos
// attached — see the FUNCTION_PAYLOAD_TOO_LARGE fix notes on
// src/app/api/stores/[storeSlug]/orders/route.ts.
//
// As of the client-compression change, the browser downscales and
// re-encodes every reference photo to JPEG (~3MB target) BEFORE upload
// — see src/lib/images/compress-reference-image.ts. That is now the
// first line of defense against both this 4MiB check and Vercel's
// 4.5MB body limit; the checks below stay as the server-side backstop
// for clients that bypass or fail compression. This value must remain
// below Vercel's 4.5MB request-body ceiling.

export const MAX_REFERENCE_IMAGES = 3
export const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
}

export function extensionForMimeType(mimeType: string): string | null {
  return EXTENSION_BY_MIME_TYPE[mimeType] ?? null
}
