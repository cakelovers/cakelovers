// Fixed, curated dictionary mapping common copyrighted-character names
// to generic visual descriptions — applied only to the text sent to the
// AI image model (see generate-cake-preview.ts), never to the
// customer's own stored description. This avoids naming a protected
// character in the OpenAI-facing prompt while preserving the customer's
// visual intent, and reduces (but does not eliminate — genericizing the
// wording doesn't guarantee a genericized image) the odds of a
// content-policy rejection.
//
// Deliberately a small, hand-maintained list, not an open-ended
// detector or LLM-driven rewrite — bounded, predictable, and auditable.
// Expanding it is a content decision, not a code change each time.
const CHARACTER_DESCRIPTIONS_KO: Record<string, string> = {
  피카츄: "노란색 계열의 귀가 길고 뾰족한 동물형 캐릭터",
  쿠로미: "검은색과 분홍색 계열의 장난기 있는 동물형 캐릭터",
  포차코: "흰색 바탕에 파란색 포인트가 있는 강아지 캐릭터",
  짱구: "짧은 머리와 진한 눈썹이 특징인 개구쟁이 소년 캐릭터",
}

// In-place substitution only — every matched character name is
// replaced with its generic description; everything else in the
// description (flavor, tiers, message, etc.) passes through unchanged.
// Never rewrites the description as a whole.
export function genericizeCharacterNames(description: string): string {
  let result = description
  for (const [name, generic] of Object.entries(CHARACTER_DESCRIPTIONS_KO)) {
    result = result.replaceAll(name, generic)
  }
  return result
}
