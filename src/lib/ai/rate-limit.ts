// Temporary, in-memory rate limiter for the AI preview endpoint.
//
// This resets on every server restart/redeploy and does not share state
// across multiple serverless instances — a known limitation, acceptable
// for MVP/pilot-scale traffic per docs/05_MVP_Implementation_Plan.md §9.
// Revisit with a durable, per-session counter once Supabase Anonymous
// Auth is wired into the customer wizard (docs/03_Architecture.md §3.1) —
// this route deliberately makes no Supabase calls yet.

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS_PER_WINDOW = 10

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 }
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 }
  }

  bucket.count += 1
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - bucket.count }
}

export function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim()
  }
  // No proxy header present (local dev without a reverse proxy) — every
  // request shares one bucket, which is fine for manual local testing.
  return "local-dev"
}
