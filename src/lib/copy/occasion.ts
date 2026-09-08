// Occasion is global, not per-store — a birthday is a birthday at every
// shop, unlike flavor/size/shape. Fixed list in code, not a DB table
// (see the Sprint 3 specification's architecture validation).
export const OCCASION_OPTIONS_KO = [
  "생일",
  "백일·돌",
  "웨딩",
  "베이비샤워",
  "집들이",
  "회사·행사",
  "기타",
] as const

export type Occasion = (typeof OCCASION_OPTIONS_KO)[number]

const KEYWORD_MAP: [Occasion, string[]][] = [
  ["생일", ["생일", "생신"]],
  ["백일·돌", ["백일", "돌잔치", "첫돌", "돌사진", "돌상"]],
  ["웨딩", ["웨딩", "결혼", "청첩", "프러포즈"]],
  ["베이비샤워", ["베이비샤워", "임신", "출산"]],
  ["집들이", ["집들이", "이사"]],
  ["회사·행사", ["회사", "행사", "기념일", "창립", "오픈"]],
]

// Best-effort keyword match against the customer's own description.
// Returns null on no match — a wrong blank is safer than a wrong
// confident guess, and the customer can always pick manually. Never
// suggests "기타"; that's a manual fallback only.
export function suggestOccasion(description: string): Occasion | null {
  for (const [occasion, keywords] of KEYWORD_MAP) {
    if (keywords.some((keyword) => description.includes(keyword))) {
      return occasion
    }
  }
  return null
}
