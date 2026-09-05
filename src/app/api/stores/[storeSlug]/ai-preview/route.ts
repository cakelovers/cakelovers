import { NextResponse } from "next/server"
import { APIError, APIConnectionTimeoutError } from "openai"
import {
  generateCakePreview,
  MissingApiKeyError,
} from "@/lib/openai/generate-cake-preview"
import { checkRateLimit, getClientKey } from "@/lib/ai/rate-limit"
import { MIN_DESCRIPTION_LENGTH, MAX_DESCRIPTION_LENGTH } from "@/lib/validation/description"

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Stateless text-to-image endpoint. No Supabase reads/writes here at
// all (per this phase's scope) — storeSlug is accepted only to match
// the API namespace convention (docs/03_Architecture.md §6.2) and isn't
// used yet. Nothing generated here is persisted anywhere; only the
// customer's eventually-selected preview will be, at order submit,
// in a later phase (docs/11_Customer_Order_Wizard.md §0.4).
export async function POST(request: Request) {
  const clientKey = getClientKey(request)
  const { allowed } = checkRateLimit(clientKey)
  if (!allowed) {
    return errorResponse(
      429,
      "rate_limited",
      "You've reached the preview limit for now — please try again in a bit."
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.")
  }

  const description = (body as { description?: unknown } | null)?.description

  if (typeof description !== "string") {
    return errorResponse(400, "invalid_description", "A design description is required.")
  }

  const trimmed = description.trim()

  if (trimmed.length < MIN_DESCRIPTION_LENGTH) {
    return errorResponse(
      400,
      "description_too_short",
      `Please describe the cake in at least ${MIN_DESCRIPTION_LENGTH} characters.`
    )
  }

  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return errorResponse(
      400,
      "description_too_long",
      `Please keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`
    )
  }

  try {
    const result = await generateCakePreview(trimmed)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      console.error("[ai-preview] OPENAI_API_KEY is not configured")
      return errorResponse(
        500,
        "not_configured",
        "The preview service is not available right now. Please try again later."
      )
    }

    if (error instanceof APIConnectionTimeoutError) {
      return errorResponse(
        504,
        "timeout",
        "Generating the preview took too long. Please try again."
      )
    }

    if (error instanceof APIError) {
      console.error("[ai-preview] OpenAI API error", error.status, error.message)

      if (error.status === 429) {
        return errorResponse(
          429,
          "upstream_rate_limited",
          "The preview service is busy right now — please try again shortly."
        )
      }

      if (error.status === 400) {
        return errorResponse(
          400,
          "rejected_prompt",
          "That description couldn't be used to generate a preview — try rephrasing it."
        )
      }

      return errorResponse(
        502,
        "upstream_error",
        "Could not generate a preview right now. Please try again."
      )
    }

    console.error("[ai-preview] unexpected error", error)
    return errorResponse(500, "unknown_error", "Something went wrong. Please try again.")
  }
}
