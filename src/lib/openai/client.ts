import OpenAI from "openai"

export class MissingApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured")
    this.name = "MissingApiKeyError"
  }
}

let cachedClient: OpenAI | null = null

// Shared across every OpenAI-calling module (image generation,
// character-genericization) — one client instance, one env-var check.
export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new MissingApiKeyError()
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey })
  }
  return cachedClient
}
