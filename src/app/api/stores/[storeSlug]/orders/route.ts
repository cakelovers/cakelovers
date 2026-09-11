import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { MAX_REFERENCE_IMAGES } from "@/lib/storage/reference-image"
import {
  MIN_DESCRIPTION_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_CUSTOMER_NOTE_LENGTH,
} from "@/lib/validation/description"
import {
  resolvePickupSettings,
  type PickupSettingsRow,
  type PickupDaySettingsRow,
} from "@/lib/admin/get-pickup-settings"
import { isPickupSlotValid, nowInTimeZone } from "@/lib/validation/pickup"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PREVIEW_BUCKET = "ai-previews"

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function readField(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  return typeof value === "string" ? value : null
}

// This route is the ONLY place in the customer flow that writes
// anything to Supabase (docs/11_Customer_Order_Wizard.md §0.4). Every
// Postgres write below runs on the customer's own session (RLS
// enforced, per docs/03_Architecture.md §2) — the service-role client
// is used strictly for the two Storage uploads, since bucket-level RLS
// policies haven't been rolled out yet (only the 5 Postgres tables'
// policies have, per docs/09_Supabase_Execution_Checklist.md §7). This
// is an explicitly-reviewed, server-only use of the service-role key,
// not a general bypass — every write it performs happens only after
// the request has already been authenticated and validated against the
// caller's own session.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> }
) {
  const { storeSlug } = await params
  const supabase = await createClient()

  // --- Auth ---------------------------------------------------------
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

  // --- Parse & validate input ----------------------------------------
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse(400, "invalid_form_data", "요청 형식이 올바르지 않습니다.")
  }

  const orderId = readField(formData, "orderId")
  const description = readField(formData, "description")?.trim() ?? ""
  const previewStoragePath = readField(formData, "previewStoragePath")
  const previewPrompt = readField(formData, "previewPrompt")
  const pickupDate = readField(formData, "pickupDate")
  const pickupTime = readField(formData, "pickupTime")
  const name = readField(formData, "name")?.trim() ?? ""
  const phone = readField(formData, "phone")?.trim() ?? ""
  const customerNote = readField(formData, "customerNote")?.trim() ?? ""
  const privacyConsentAccepted = readField(formData, "privacyConsentAccepted") === "true"

  if (!orderId || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "주문 번호가 없거나 올바르지 않습니다.")
  }
  if (description.length < MIN_DESCRIPTION_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) {
    return errorResponse(400, "invalid_description", "올바른 디자인 설명을 입력해 주세요.")
  }
  if (!previewStoragePath) {
    return errorResponse(
      400,
      "missing_preview",
      "주문을 제출하기 전에 AI 미리보기를 선택해 주세요."
    )
  }
  if (!previewPrompt) {
    return errorResponse(400, "missing_preview_prompt", "미리보기 프롬프트가 없습니다.")
  }
  if (!pickupDate || Number.isNaN(Date.parse(pickupDate))) {
    return errorResponse(400, "invalid_pickup_date", "올바른 픽업 날짜를 선택해 주세요.")
  }
  if (!pickupTime || !/^\d{2}:\d{2}$/.test(pickupTime)) {
    return errorResponse(400, "invalid_pickup_time", "올바른 픽업 시간을 선택해 주세요.")
  }
  if (!name) {
    return errorResponse(400, "missing_name", "이름을 입력해 주세요.")
  }
  if (!phone) {
    return errorResponse(400, "missing_phone", "전화번호를 입력해 주세요.")
  }
  if (customerNote.length > MAX_CUSTOMER_NOTE_LENGTH) {
    return errorResponse(
      400,
      "customer_note_too_long",
      `추가 메모는 ${MAX_CUSTOMER_NOTE_LENGTH}자 이하로 입력해 주세요.`
    )
  }
  if (!privacyConsentAccepted) {
    return errorResponse(
      400,
      "privacy_consent_required",
      "제출하기 전에 개인정보처리방침에 동의해 주세요."
    )
  }

  // Reference photos were already uploaded individually via prior calls
  // to .../reference-images/save (same FUNCTION_PAYLOAD_TOO_LARGE fix
  // as the preview image — see that route). This request only ever
  // carries the resulting path strings, never the binary files.
  const referenceImagePaths: { position: number; storagePath: string }[] = []
  for (let position = 1; position <= MAX_REFERENCE_IMAGES; position++) {
    const value = readField(formData, `reference_${position}_path`)
    if (value) {
      referenceImagePaths.push({ position, storagePath: value })
    }
  }

  // --- Resolve store ---------------------------------------------------
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, timezone")
    .eq("slug", storeSlug)
    .eq("is_active", true)
    .maybeSingle<{ id: string; timezone: string }>()

  if (storeError || !store) {
    return errorResponse(404, "store_not_found", "매장을 찾을 수 없습니다.")
  }

  // --- Validate pickup date/time against the store's own settings ------
  // The customer picker (pickup-slots route) only ever offers slots this
  // same check would also accept — this is the actual enforcement, not
  // a formality, since a stale page or a direct API call could still
  // submit something the picker no longer offers. Reads via
  // service-role: pickup settings are members-only RLS (0007), and this
  // request runs on the customer's own session, not staff's. The same
  // client instance is reused below for the Storage rollback path.
  const serviceRole = createServiceRoleClient()
  const [{ data: intervalRow }, { data: dayRows }] = await Promise.all([
    serviceRole
      .from("store_pickup_settings")
      .select("pickup_interval_minutes")
      .eq("store_id", store.id)
      .maybeSingle<PickupSettingsRow>(),
    serviceRole
      .from("store_pickup_day_settings")
      .select("weekday, is_enabled, opening_time, closing_time, min_lead_hours")
      .eq("store_id", store.id)
      .returns<PickupDaySettingsRow[]>(),
  ])
  const pickupSettings = resolvePickupSettings(intervalRow, dayRows ?? [])
  const now = nowInTimeZone(store.timezone)

  if (!isPickupSlotValid(pickupSettings, now, pickupDate, pickupTime)) {
    return errorResponse(
      400,
      "pickup_slot_unavailable",
      "선택하신 픽업 시간은 더 이상 이용할 수 없습니다. 다른 시간을 선택해 주세요."
    )
  }

  // The preview was already uploaded by a prior call to
  // .../ai-preview/save (see that route for why — this is the fix for
  // FUNCTION_PAYLOAD_TOO_LARGE). All this route gets is the resulting
  // path string; confirm it actually belongs to this store+order rather
  // than trusting an arbitrary client-supplied path verbatim.
  if (!previewStoragePath.startsWith(`${store.id}/${orderId}/`)) {
    return errorResponse(400, "invalid_preview_data", "선택한 미리보기 이미지가 올바르지 않습니다.")
  }

  // Same check for each reference photo path, already uploaded by a
  // prior call to .../reference-images/save.
  for (const { storagePath } of referenceImagePaths) {
    if (!storagePath.startsWith(`${store.id}/${orderId}/`)) {
      return errorResponse(400, "invalid_reference_data", "참고 사진 중 하나가 올바르지 않습니다.")
    }
  }

  // --- Idempotent replay: this exact order may already have been submitted ---
  // (a retry after a dropped response, or a double-tap race) — the client
  // reuses the same orderId on retry specifically so this check works.
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle()

  if (existingOrder) {
    return NextResponse.json({ orderId: existingOrder.id })
  }

  // --- Resolve or create the customer row ------------------------------
  // No UPDATE policy exists on `customers` yet (by design — see
  // docs/09_Supabase_Execution_Checklist.md §7), so a returning customer's
  // row is reused as-is rather than refreshed with newly typed contact
  // info. Revisit if that turns out to matter in practice.
  let customerId: string

  const { data: existingCustomer, error: existingCustomerError } = await supabase
    .from("customers")
    .select("id")
    .eq("store_id", store.id)
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (existingCustomerError) {
    return errorResponse(500, "customer_lookup_failed", "주문을 제출하지 못했습니다. 다시 시도해 주세요.")
  }

  if (existingCustomer) {
    customerId = existingCustomer.id
  } else {
    const { data: newCustomer, error: customerInsertError } = await supabase
      .from("customers")
      .insert({ store_id: store.id, auth_user_id: user.id, name, phone: phone || null, email: null })
      .select("id")
      .single()

    if (customerInsertError || !newCustomer) {
      return errorResponse(500, "customer_create_failed", "주문을 제출하지 못했습니다. 다시 시도해 주세요.")
    }
    customerId = newCustomer.id
  }

  // --- Create the order -------------------------------------------------
  const { error: orderInsertError } = await supabase.from("orders").insert({
    id: orderId,
    store_id: store.id,
    customer_id: customerId,
    description,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    ai_preview_storage_path: previewStoragePath,
    ai_preview_prompt: previewPrompt,
    customer_note: customerNote || null,
    privacy_consent_given_at: new Date().toISOString(),
  })

  if (orderInsertError) {
    // Unique-violation on `id` means we lost a race to an identical
    // concurrent submit (e.g. a double-tap) — that other request's
    // order is the real one, and it points at the exact same preview
    // path, so do NOT delete it here.
    if (orderInsertError.code === "23505") {
      return NextResponse.json({ orderId })
    }

    // Genuine failure, not a race — nothing will ever reference this
    // upload, so roll it back.
    await serviceRole.storage.from(PREVIEW_BUCKET).remove([previewStoragePath])
    // TEMPORARY — diagnosing the production order_create_failed
    // incident. The generic console.error(orderInsertError) wasn't
    // reliably surfacing which column/constraint Postgres/PostgREST
    // rejected. Remove once the failing cause is confirmed and fixed.
    console.error("[orders] order insert failed", {
      message: orderInsertError.message,
      details: orderInsertError.details,
      hint: orderInsertError.hint,
      code: orderInsertError.code,
    })
    return errorResponse(500, "order_create_failed", "주문을 제출하지 못했습니다. 다시 시도해 주세요.")
  }

  // --- Record reference images (already uploaded, best-effort insert) --
  // Each photo was uploaded individually by a prior call to
  // .../reference-images/save (same fix as the preview image — see that
  // route). This route only records the resulting paths; the order
  // above is already complete and valid without these, so a failed
  // insert here shouldn't undo a successful order.
  if (referenceImagePaths.length > 0) {
    const { error: referenceInsertError } = await supabase.from("reference_images").insert(
      referenceImagePaths.map((row) => ({
        store_id: store.id,
        order_id: orderId,
        storage_path: row.storagePath,
        position: row.position,
      }))
    )

    if (referenceInsertError) {
      // Non-fatal for the same reason as above: log and move on.
      console.error("[orders] reference_images insert failed", referenceInsertError)
    }
  }

  return NextResponse.json({ orderId })
}
