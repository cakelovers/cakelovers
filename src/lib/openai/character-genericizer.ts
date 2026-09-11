import { getOpenAIClient } from "./client"

// Small, fast text model — this is a short bounded rewrite task, not
// open-ended generation, and runs in front of the (slower, costlier)
// image call.
const MODEL = "gpt-4o-mini"

// Short and strict: this must never meaningfully add to the customer's
// wait, and must never be the reason preview generation stalls.
const TIMEOUT_MS = 8_000

const CACHE_TTL_MS = 10 * 60 * 1000

// Below this ratio of (output length / input length), the response is
// treated as a suspicious full rewrite rather than a targeted
// in-place replacement — see the "not acceptable" example in the
// approved specification — and discarded in favor of the original text.
const MIN_LENGTH_RATIO = 0.6

const SYSTEM_PROMPT = `당신은 케이크 주문 설명에서 저작권이 있는 캐릭터나 IP(포켓몬, 산리오, 디즈니, 픽사, 닌텐도, 마블, DC, 애니메이션, 게임 캐릭터 등을 포함하되 이에 국한되지 않음)에 대한 언급을 찾아 일반적인 시각적 묘사로 바꾸는 도구입니다.

규칙:
1. 캐릭터/IP를 가리키는 부분만 짧은 일반적 시각 묘사(색상, 형태, 분위기)로 교체합니다.
2. 색상, 글자 문구, 케이크 사이즈, 장식, 날짜, 이름, 기타 요청사항 등 캐릭터와 무관한 내용은 원문 그대로 유지합니다.
3. 문장 전체를 다시 쓰지 않습니다 — 캐릭터를 가리키는 부분만 교체하는 targeted replacement입니다.
4. 캐릭터/IP 언급이 없으면 입력을 그대로 반환합니다.
5. 수정된 전체 설명 텍스트만 반환하고, 다른 설명·따옴표·머리말을 덧붙이지 않습니다.`

interface CacheEntry {
  value: string
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function getCached(key: string): string | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function setCached(key: string, value: string): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

// Detects and replaces copyrighted character/IP references with a
// generic visual description, in place — leaving colors, lettering,
// size, decorations, dates, names, and other requests untouched. Not a
// dictionary: works for any character the model itself recognizes, not
// just ones enumerated in code (see the approved architecture review).
//
// Fails open on every error path: a missing API key, network error,
// timeout, empty response, or a response that looks like a full
// rewrite instead of a targeted replacement all fall back to the
// original, untransformed description. This function must never be
// capable of blocking or failing preview generation itself — if it
// can't safely transform the text, generation proceeds on the
// customer's original wording, same as if this feature didn't exist.
export async function genericizeCharacterNames(description: string): Promise<string> {
  const cached = getCached(description)
  if (cached !== null) return cached

  try {
    const client = getOpenAIClient()
    const response = await client.chat.completions.create(
      {
        model: MODEL,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: description },
        ],
      },
      { timeout: TIMEOUT_MS }
    )

    const transformed = response.choices[0]?.message?.content?.trim()

    if (!transformed) {
      return description
    }

    if (transformed.length < description.length * MIN_LENGTH_RATIO) {
      return description
    }

    setCached(description, transformed)
    return transformed
  } catch {
    return description
  }
}
