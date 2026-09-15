import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import { MAX_REFERENCE_IMAGE_BYTES } from "@/lib/storage/reference-image"
import { looksLikeHeic, normalizeToJpeg } from "@/lib/storage/normalize-image"

// Node runtime for the same reason as reference-images/save: HEIC
// decoding (heic-convert/libheif) and sharp both need it, not Edge.
export const runtime = "nodejs"
export const maxDuration = 60

const PREVIEW_BUCKET = "ai-previews"

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Admin-only upload for a catalog design photo (settings screen). Same
// normalize-to-JPEG pipeline as reference-images/save, reused rather
// than reimplemented — the only difference is the auth check
// (store membership, not a customer session) and the destination
// (a stable per-design path, not a per-order one). Deliberately writes
// into the existing "ai-previews" bucket rather than a new one, so the
// customer tracking page and order submission's image resolution need
// no awareness of where a design's photo came from.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> }
) {
  const { storeSlug } = await params
  const membership = await getStoreMembership(storeSlug)

  if (!membership) {
    return errorResponse(401, "not_authorized", "권한이 없습니다.")
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse(400, "invalid_form_data", "요청 형식이 올바르지 않습니다.")
  }

  const file = formData.get("file")

  if (!(file instanceof File) || file.size === 0) {
    return errorResponse(400, "missing_file", "사진 파일이 필요합니다.")
  }

  if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
    return errorResponse(400, "image_too_large", "사진 용량이 너무 큽니다 — 4MB 이하로 첨부해 주세요.")
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer())

  const declaredType = file.type.toLowerCase()
  const plausiblyImage =
    declaredType === "" ||
    (declaredType.startsWith("image/") && declaredType !== "image/svg+xml") ||
    looksLikeHeic(inputBuffer)

  if (!plausiblyImage) {
    return errorResponse(400, "invalid_image_type", "JPEG, PNG, WebP 또는 HEIC 형식의 사진을 선택해 주세요.")
  }

  let normalized
  try {
    normalized = await normalizeToJpeg(inputBuffer)
  } catch (error) {
    console.error("[catalog-designs/upload] normalization failed", error)
    return errorResponse(
      400,
      "invalid_image_type",
      "지원하지 않는 사진 형식입니다. JPEG 또는 PNG 파일을 선택해 주세요."
    )
  }

  // One stable path per uploaded photo (not per-order) — a design's
  // image is reused across every order that selects it, for as long as
  // the design stays enabled.
  const storagePath = `${membership.storeId}/catalog/${crypto.randomUUID()}.${normalized.extension}`

  const serviceRole = createServiceRoleClient()
  const { error: uploadError } = await serviceRole.storage
    .from(PREVIEW_BUCKET)
    .upload(storagePath, normalized.buffer, {
      contentType: normalized.contentType,
      upsert: true,
    })

  if (uploadError) {
    console.error("[catalog-designs/upload] upload failed", uploadError)
    return errorResponse(502, "image_upload_failed", "사진을 저장하지 못했습니다. 다시 시도해 주세요.")
  }

  return NextResponse.json({ storagePath })
}
