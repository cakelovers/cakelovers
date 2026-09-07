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
      "지금은 미리보기 생성 한도에 도달했어요 — 잠시 후 다시 시도해 주세요."
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "invalid_json", "요청 형식이 올바르지 않습니다.")
  }

  const description = (body as { description?: unknown } | null)?.description

  if (typeof description !== "string") {
    return errorResponse(400, "invalid_description", "디자인 설명이 필요합니다.")
  }

  const trimmed = description.trim()

  if (trimmed.length < MIN_DESCRIPTION_LENGTH) {
    return errorResponse(
      400,
      "description_too_short",
      `케이크 설명을 ${MIN_DESCRIPTION_LENGTH}자 이상 입력해 주세요.`
    )
  }

  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return errorResponse(
      400,
      "description_too_long",
      `설명은 ${MAX_DESCRIPTION_LENGTH}자 이하로 입력해 주세요.`
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
        "지금은 미리보기 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요."
      )
    }

    if (error instanceof APIConnectionTimeoutError) {
      return errorResponse(
        504,
        "timeout",
        "미리보기 생성 시간이 너무 오래 걸렸습니다. 다시 시도해 주세요."
      )
    }

    if (error instanceof APIError) {
      console.error("[ai-preview] OpenAI API error", error.status, error.message)

      if (error.status === 429) {
        return errorResponse(
          429,
          "upstream_rate_limited",
          "지금은 미리보기 서비스가 혼잡합니다 — 잠시 후 다시 시도해 주세요."
        )
      }

      if (error.status === 400) {
        return errorResponse(
          400,
          "rejected_prompt",
          "이 설명으로는 미리보기를 생성할 수 없습니다 — 다르게 표현해 보세요."
        )
      }

      return errorResponse(
        502,
        "upstream_error",
        "지금은 미리보기를 생성할 수 없습니다. 다시 시도해 주세요."
      )
    }

    console.error("[ai-preview] unexpected error", error)
    return errorResponse(500, "unknown_error", "문제가 발생했습니다. 다시 시도해 주세요.")
  }
}
