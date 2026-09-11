import { getOpenAIClient, MissingApiKeyError } from "./client"
import { genericizeCharacterNames } from "./character-genericizer"

// Server-only. Text-to-image only — reference images are never an input
// here (see docs/03_Architecture.md §4 and docs/11_Customer_Order_Wizard.md).
const MODEL = "gpt-image-1"

// Re-exported so existing callers (ai-preview/route.ts) don't need to
// change their import path — the client/error now live in ./client,
// shared with character-genericizer.ts.
export { MissingApiKeyError }

export function buildCakePreviewPrompt(description: string): string {
  return (
    "A professional, appetizing product photo of a custom celebration cake, " +
    `based on this customer's request: "${description}". Studio lighting, ` +
    "plain neutral background, no text overlays, no watermarks, photorealistic."
  )
}

export interface GeneratedPreview {
  image: string // data: URL — gpt-image-1 always returns base64, never a temporary URL
  prompt: string
}

export async function generateCakePreview(description: string): Promise<GeneratedPreview> {
  // Only the AI-facing prompt is genericized — the caller's original
  // description (persisted as orders.description) is never touched;
  // this function receives a copy, not a reference it could mutate.
  // genericizeCharacterNames fails open on any error, so this call
  // itself never becomes a new reason generation fails.
  const genericized = await genericizeCharacterNames(description)
  const prompt = buildCakePreviewPrompt(genericized)
  const client = getOpenAIClient()

  const response = await client.images.generate(
    {
      model: MODEL,
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "low", // cost-optimized default for MVP — revisit after real output review
    },
    { timeout: 30_000 }
  )

  const b64 = response.data?.[0]?.b64_json
  if (!b64) {
    throw new Error("OpenAI returned no image data")
  }

  return { image: `data:image/png;base64,${b64}`, prompt }
}
