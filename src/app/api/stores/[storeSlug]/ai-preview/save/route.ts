import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { decodeDataUrl } from "@/lib/storage/data-url"
import { extensionForMimeType } from "@/lib/storage/reference-image"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PREVIEW_BUCKET = "ai-previews"

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Fix for FUNCTION_PAYLOAD_TOO_LARGE (413) on POST .../orders: Vercel
// caps serverless function request bodies at 4.5MB (platform-level,
// not configurable). A selected AI preview is ~1.5-2.5MB as base64 —
// bundling it into the same request as the final order (plus any
// reference photos) could exceed that ceiling. This route uploads the
// selected preview the moment the customer picks it, so the final
// /orders submission only ever carries a short storage path string,
// never the image bytes.
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.")
  }

  const { orderId, previewImage } = (body ?? {}) as {
    orderId?: unknown
    previewImage?: unknown
  }

  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "Missing or invalid order id.")
  }
  if (typeof previewImage !== "string" || !previewImage.startsWith("data:image/")) {
    return errorResponse(400, "invalid_preview_data", "A valid preview image is required.")
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

  let decoded: { buffer: Buffer; contentType: string }
  try {
    decoded = decodeDataUrl(previewImage)
  } catch {
    return errorResponse(400, "invalid_preview_data", "The selected preview image is invalid.")
  }

  const extension = extensionForMimeType(decoded.contentType) ?? "png"
  const storagePath = `${store.id}/${orderId}/preview.${extension}`

  const serviceRole = createServiceRoleClient()
  const { error: uploadError } = await serviceRole.storage
    .from(PREVIEW_BUCKET)
    .upload(storagePath, decoded.buffer, {
      contentType: decoded.contentType,
      upsert: true,
    })

  if (uploadError) {
    console.error("[ai-preview/save] upload failed", uploadError)
    return errorResponse(
      502,
      "preview_upload_failed",
      "Could not save your selected preview. Please try again."
    )
  }

  return NextResponse.json({ storagePath })
}
