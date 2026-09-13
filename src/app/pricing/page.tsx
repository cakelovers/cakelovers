import Link from "next/link"
import { Button } from "@/components/ui/button"

// Relocated from the landing page's former pricing section — the
// landing page now only links here via "이용 요금 보기" rather than
// showing plan details inline. Content and layout (plain typography,
// no cards, no checkmark icons) are unchanged from that section.
const PRICING_PLANS = [
  {
    name: "Basic",
    price: "₩19,000",
    description: "온라인 주문을 처음 시작하는 매장을 위한 요금제입니다.",
    features: ["주문 위저드", "AI 케이크 미리보기", "주문 관리", "진행 상태 확인"],
  },
  {
    name: "Pro",
    price: "₩49,000 ~ ₩59,000",
    description: "더 많은 주문을 처리하는 매장을 위한 요금제입니다.",
    features: ["Basic 전체 포함", "더 많은 미리보기 생성", "우선 지원", "신규 기능 우선 제공"],
    highlighted: true,
  },
]

export default function PricingPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-10">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground underline">
          &larr; 홈으로
        </Link>
        <h1 className="font-heading text-2xl font-semibold">이용 요금</h1>
      </div>

      <div className="grid gap-0 divide-y divide-border border border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {PRICING_PLANS.map((plan) => (
          <div key={plan.name} className="flex flex-col gap-4 p-6">
            <div>
              <p className="text-xs tracking-[0.06em] text-muted-foreground uppercase">
                {plan.name}
                {plan.highlighted && " · 인기"}
              </p>
              <p className="mt-2 text-2xl font-bold">
                {plan.price}
                <span className="text-sm font-normal text-muted-foreground">/월</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Button asChild variant={plan.highlighted ? "default" : "outline"} className="mt-2 self-start">
              <Link href="/login">시작하기</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
