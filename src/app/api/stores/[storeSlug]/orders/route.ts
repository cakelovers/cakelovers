import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { MAX_REFERENCE_IMAGES } from "@/lib/storage/reference-image"
import {
  MIN_DESCRIPTION_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_CUSTOMER_NOTE_LENGTH,
} from "@/lib/validation/description"

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
  const previewStoragePath = readField(formData, "previewStoragePath")
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
  if (!previewStoragePath) {
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
    .select("id")
    .eq("slug", storeSlug)
    .eq("is_active", true)
    .maybeSingle()

  if (storeError || !store) {
    return errorResponse(404, "store_not_found", "This store could not be found.")
  }

  // The preview was already uploaded by a prior call to
  // .../ai-preview/save (see that route for why — this is the fix for
  // FUNCTION_PAYLOAD_TOO_LARGE). All this route gets is the resulting
  // path string; confirm it actually belongs to this store+order rather
  // than trusting an arbitrary client-supplied path verbatim.
  if (!previewStoragePath.startsWith(`${store.id}/${orderId}/`)) {
    return errorResponse(400, "invalid_preview_data", "The selected preview image is invalid.")
  }

  // Same check for each reference photo path, already uploaded by a
  // prior call to .../reference-images/save.
  for (const { storagePath } of referenceImagePaths) {
    if (!storagePath.startsWith(`${store.id}/${orderId}/`)) {
      return errorResponse(400, "invalid_reference_data", "One of the reference photos is invalid.")
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

  const serviceRole = createServiceRoleClient()

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
    console.error("[orders] order insert failed", orderInsertError)
    return errorResponse(500, "order_create_failed", "Could not submit your order. Please try again.")
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
