import OpenAI from "openai"

// Server-only. Text-to-image only — reference images are never an input
// here (see docs/03_Architecture.md §4 and docs/11_Customer_Order_Wizard.md).
const MODEL = "gpt-image-1"

let cachedClient: OpenAI | null = null

export class MissingApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured")
    this.name = "MissingApiKeyError"
  }
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new MissingApiKeyError()
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey })
  }
  return cachedClient
}

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
  const prompt = buildCakePreviewPrompt(description)
  const client = getClient()

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
