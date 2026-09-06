import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import {
  MAX_REFERENCE_IMAGES,
  MAX_REFERENCE_IMAGE_BYTES,
  extensionForMimeType,
} from "@/lib/storage/reference-image"

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

  const extension = extensionForMimeType(file.type)
  if (!extension) {
    return errorResponse(
      400,
      "invalid_reference_type",
      "Reference photo must be a JPEG, PNG, WebP, or HEIC image."
    )
  }

  if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
    return errorResponse(
      400,
      "reference_too_large",
      "This photo is too large — please keep it under 4MB."
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

  const storagePath = `${store.id}/${orderId}/${position}.${extension}`
  const arrayBuffer = await file.arrayBuffer()

  const serviceRole = createServiceRoleClient()
  const { error: uploadError } = await serviceRole.storage
    .from(REFERENCE_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

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
