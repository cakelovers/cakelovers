import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { decodeDataUrl } from "@/lib/storage/data-url"
import {
  MAX_REFERENCE_IMAGES,
  MAX_REFERENCE_IMAGE_BYTES,
  extensionForMimeType,
} from "@/lib/storage/reference-image"
import {
  MIN_DESCRIPTION_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_CUSTOMER_NOTE_LENGTH,
} from "@/lib/validation/description"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PREVIEW_BUCKET = "ai-previews"
const REFERENCE_BUCKET = "reference-images"

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
      "Your session has expired. Please reload the page and try again."
    )
  }

  // --- Parse & validate input ----------------------------------------
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse(400, "invalid_form_data", "Request body must be multipart form data.")
  }

  const orderId = readField(formData, "orderId")
  const description = readField(formData, "description")?.trim() ?? ""
  const previewImage = readField(formData, "previewImage")
  const previewPrompt = readField(formData, "previewPrompt")
  const pickupDate = readField(formData, "pickupDate")
  const pickupTime = readField(formData, "pickupTime")
  const name = readField(formData, "name")?.trim() ?? ""
  const phone = readField(formData, "phone")?.trim() ?? ""
  const email = readField(formData, "email")?.trim() ?? ""
  const customerNote = readField(formData, "customerNote")?.trim() ?? ""

  if (!orderId || !UUID_PATTERN.test(orderId)) {
    return errorResponse(400, "invalid_order_id", "Missing or invalid order id.")
  }
  if (description.length < MIN_DESCRIPTION_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) {
    return errorResponse(400, "invalid_description", "Please provide a valid design description.")
  }
  if (!previewImage || !previewImage.startsWith("data:image/")) {
    return errorResponse(
      400,
      "missing_preview",
      "Please select an AI preview before submitting your order."
    )
  }
  if (!previewPrompt) {
    return errorResponse(400, "missing_preview_prompt", "Missing preview prompt.")
  }
  if (!pickupDate || Number.isNaN(Date.parse(pickupDate))) {
    return errorResponse(400, "invalid_pickup_date", "Please choose a valid pickup date.")
  }
  if (!pickupTime || !/^\d{2}:\d{2}$/.test(pickupTime)) {
    return errorResponse(400, "invalid_pickup_time", "Please choose a valid pickup time.")
  }
  if (!name) {
    return errorResponse(400, "missing_name", "Please enter your name.")
  }
  if (!phone && !email) {
    return errorResponse(400, "missing_contact", "Please provide a phone number or email address.")
  }
  if (customerNote.length > MAX_CUSTOMER_NOTE_LENGTH) {
    return errorResponse(
      400,
      "customer_note_too_long",
      `Please keep additional notes under ${MAX_CUSTOMER_NOTE_LENGTH} characters.`
    )
  }

  const referenceFiles: { position: number; file: File }[] = []
  for (let position = 1; position <= MAX_REFERENCE_IMAGES; position++) {
    const value = formData.get(`reference_${position}`)
    if (value instanceof File && value.size > 0) {
      if (!extensionForMimeType(value.type)) {
        return errorResponse(
          400,
          "invalid_reference_type",
          `Reference photo ${position} must be a JPEG, PNG, WebP, or HEIC image.`
        )
      }
      if (value.size > MAX_REFERENCE_IMAGE_BYTES) {
        return errorResponse(
          400,
          "reference_too_large",
          `Reference photo ${position} is too large — please keep each photo under 5MB.`
        )
      }
      referenceFiles.push({ position, file: value })
    }
  }

  // --- Resolve store ---------------------------------------------------
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", storeSlug)
    .eq("is_active", true)
    .maybeSingle()

  if (storeError || !store) {
    return errorResponse(404, "store_not_found", "This store could not be found.")
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
    return errorResponse(500, "customer_lookup_failed", "Could not submit your order. Please try again.")
  }

  if (existingCustomer) {
    customerId = existingCustomer.id
  } else {
    const { data: newCustomer, error: customerInsertError } = await supabase
      .from("customers")
      .insert({ store_id: store.id, auth_user_id: user.id, name, phone: phone || null, email: email || null })
      .select("id")
      .single()

    if (customerInsertError || !newCustomer) {
      return errorResponse(500, "customer_create_failed", "Could not submit your order. Please try again.")
    }
    customerId = newCustomer.id
  }

  // --- Upload the selected AI preview (mandatory — see schema NOT NULL) ---
  const serviceRole = createServiceRoleClient()

  let previewBuffer: { buffer: Buffer; contentType: string }
  try {
    previewBuffer = decodeDataUrl(previewImage)
  } catch {
    return errorResponse(400, "invalid_preview_data", "The selected preview image is invalid.")
  }

  const previewExtension = extensionForMimeType(previewBuffer.contentType) ?? "png"
  const previewPath = `${store.id}/${orderId}/preview.${previewExtension}`

  // upsert: true is deliberate — two near-simultaneous submits with the
  // same orderId (a double-tap race) both compute this exact same path.
  // Without upsert, the second request's upload would fail here before
  // it ever reaches the duplicate-order check below that's supposed to
  // handle that race gracefully.
  const { error: previewUploadError } = await serviceRole.storage
    .from(PREVIEW_BUCKET)
    .upload(previewPath, previewBuffer.buffer, {
      contentType: previewBuffer.contentType,
      upsert: true,
    })

  if (previewUploadError) {
    console.error("[orders] preview upload failed", previewUploadError)
    return errorResponse(
      502,
      "preview_upload_failed",
      "Could not save your selected preview. Please try again."
    )
  }

  // --- Create the order -------------------------------------------------
  const { error: orderInsertError } = await supabase.from("orders").insert({
    id: orderId,
    store_id: store.id,
    customer_id: customerId,
    description,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    ai_preview_storage_path: previewPath,
    ai_preview_prompt: previewPrompt,
    customer_note: customerNote || null,
  })

  if (orderInsertError) {
    // Unique-violation on `id` means we lost a race to an identical
    // concurrent submit (e.g. a double-tap) — that other request's
    // order is the real one, and it points at the exact same preview
    // path we just (re-)wrote, so do NOT delete it here.
    if (orderInsertError.code === "23505") {
      return NextResponse.json({ orderId })
    }

    // Genuine failure, not a race — nothing will ever reference this
    // upload, so roll it back.
    await serviceRole.storage.from(PREVIEW_BUCKET).remove([previewPath])
    console.error("[orders] order insert failed", orderInsertError)
    return errorResponse(500, "order_create_failed", "Could not submit your order. Please try again.")
  }

  // --- Upload reference images (best-effort, non-blocking per file) ----
  // The order above is already complete and valid without these — a
  // failed reference photo shouldn't undo a successful order.
  const uploadedReferenceRows: { position: number; storagePath: string }[] = []

  for (const { position, file } of referenceFiles) {
    const extension = extensionForMimeType(file.type)!
    const path = `${store.id}/${orderId}/${position}.${extension}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await serviceRole.storage
      .from(REFERENCE_BUCKET)
      .upload(path, arrayBuffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error("[orders] reference image upload failed", position, uploadError)
      continue
    }
    uploadedReferenceRows.push({ position, storagePath: path })
  }

  if (uploadedReferenceRows.length > 0) {
    const { error: referenceInsertError } = await supabase.from("reference_images").insert(
      uploadedReferenceRows.map((row) => ({
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
