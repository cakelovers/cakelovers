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
      "세션이 만료되었습니다. 페이지를 새로고침한 후 다시 시도해 주세요."
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const { orderId, previewImage } = (body ?? {}) as {
    orderId?: unknown
    previewImage?: unknown
  }

  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "주문 번호가 없거나 올바르지 않습니다.")
  }
  if (typeof previewImage !== "string" || !previewImage.startsWith("data:image/")) {
    return errorResponse(400, "invalid_preview_data", "유효한 미리보기 이미지가 필요합니다.")
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", storeSlug)
    .eq("is_active", true)
    .maybeSingle()

  if (storeError || !store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  let decoded: { buffer: Buffer; contentType: string }
  try {
    decoded = decodeDataUrl(previewImage)
  } catch {
    return errorResponse(400, "invalid_preview_data", "선택한 미리보기 이미지가 올바르지 않습니다.")
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
      "선택한 미리보기를 저장하지 못했습니다. 다시 시도해 주세요."
    )
  }

  return NextResponse.json({ storagePath })
}
