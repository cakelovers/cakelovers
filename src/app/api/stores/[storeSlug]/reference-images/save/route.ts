import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import {
  MAX_REFERENCE_IMAGES,
  MAX_REFERENCE_IMAGE_BYTES,
} from "@/lib/storage/reference-image"
import { looksLikeHeic, normalizeToJpeg } from "@/lib/storage/normalize-image"

// heic-convert (libheif) and sharp both need the Node.js runtime, not
// Edge. Decoding a HEIC from a phone runs comfortably in a few seconds,
// but give it headroom over the default function timeout.
export const runtime = "nodejs"
export const maxDuration = 60

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REFERENCE_BUCKET = "reference-images"

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Same fix as .../ai-preview/save, applied to reference photos: each
// photo is uploaded in its own small request instead of traveling as a
// binary multipart part inside the final /orders submission, where up
// to 3 real photos could combine with everything else to exceed
// Vercel's 4.5MB serverless function body limit
// (FUNCTION_PAYLOAD_TOO_LARGE). The final submission now carries only
// the resulting storage path string for each uploaded photo.
//
// Every photo is normalized to a downscaled JPEG here
// (src/lib/storage/normalize-image.ts) before it is stored. The client
// (src/lib/images/compress-reference-image.ts) already does this for any
// photo the browser can decode; this route repeats it server-side so the
// result no longer depends on the browser being able to decode HEIC/HEIF
// — the case that previously slipped through as an un-decodable original
// and got rejected by the old MIME allowlist, silently dropping the
// photo from the order.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> }
) {
  const { storeSlug } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return errorResponse(
      401,
      "not_authenticated",
      "Your session has expired. Please reload the page and try again."
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse(400, "invalid_form_data", "Request body must be multipart form data.")
  }

  const orderId = formData.get("orderId")
  const positionRaw = formData.get("position")
  const file = formData.get("file")

  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "Missing or invalid order id.")
  }

  const position = Number(positionRaw)
  if (!Number.isInteger(position) || position < 1 || position > MAX_REFERENCE_IMAGES) {
    return errorResponse(400, "invalid_position", "Invalid reference photo position.")
  }

  if (!(file instanceof File) || file.size === 0) {
    return errorResponse(400, "missing_file", "A reference photo file is required.")
  }

  if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
    return errorResponse(
      400,
      "reference_too_large",
      "This photo is too large — please keep it under 4MB."
    )
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer())

  // Accept anything that is, or plausibly is, a raster image: an
  // image/* type, an empty type (common for HEIC picked from a file
  // provider), or bytes that sniff as HEIC regardless of the declared
  // type. Reject the things normalization can't or shouldn't handle
  // (SVG is a script-injection vector; PDFs/videos/etc. aren't photos)
  // up front so the customer gets a clear message.
  const declaredType = file.type.toLowerCase()
  const plausiblyImage =
    declaredType === "" ||
    (declaredType.startsWith("image/") && declaredType !== "image/svg+xml") ||
    looksLikeHeic(inputBuffer)

  if (!plausiblyImage) {
    return errorResponse(
      400,
      "invalid_reference_type",
      "Reference photo must be a JPEG, PNG, WebP, or HEIC image."
    )
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", storeSlug)
    .eq("is_active", true)
    .maybeSingle()

  if (storeError || !store) {
    return errorResponse(404, "store_not_found", "This store could not be found.")
  }

  // Normalize to a downscaled JPEG. A decode failure here means the
  // bytes aren't an image we can process at all — surface it as a 400 so
  // the customer can pick a different photo, never a silent drop.
  let normalized
  try {
    normalized = await normalizeToJpeg(inputBuffer)
  } catch (error) {
    console.error("[reference-images/save] normalization failed", error)
    return errorResponse(
      400,
      "invalid_reference_type",
      "This photo format isn't supported. Please choose a JPEG or PNG."
    )
  }

  const storagePath = `${store.id}/${orderId}/${position}.${normalized.extension}`

  const serviceRole = createServiceRoleClient()
  const { error: uploadError } = await serviceRole.storage
    .from(REFERENCE_BUCKET)
    .upload(storagePath, normalized.buffer, {
      contentType: normalized.contentType,
      upsert: true,
    })

  if (uploadError) {
    console.error("[reference-images/save] upload failed", uploadError)
    return errorResponse(
      502,
      "reference_upload_failed",
      "Could not save this reference photo. Please try again."
    )
  }

  return NextResponse.json({ storagePath, position })
}
