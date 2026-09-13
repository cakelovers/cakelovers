import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// Store-owner destination — everything that used to live in the
// landing page's "For bakers" footnote plus the standalone /pricing
// page now lives here (linked from "이용 요금 보기"). Same editorial
// visual language as the landing page: eyebrow labels, plain
// typography, no cards, no pricing-table treatment.
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

export default function ForBakersPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <span className="font-script text-4xl leading-none text-primary">Cake Lovers</span>
        <Link href="/" className="text-xs text-muted-foreground">
          &larr; 홈으로
        </Link>
      </header>

      {/* Intro */}
      <section className="border-t border-border py-10 sm:py-14">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 sm:px-10">
          <p className="text-xs tracking-[0.1em] text-muted-foreground uppercase">
            사장님을 위한 서비스
          </p>
          <h1 className="text-xl font-bold sm:text-3xl">
            주문 접수부터 픽업까지,
            <br />
            한 곳에서 관리하세요.
          </h1>
          <p className="max-w-md text-sm text-muted-foreground sm:text-base">
            고객이 직접 디자인을 설명하고 AI 미리보기로 확인한 뒤 주문하면,
            사장님은 견적과 제작 상태만 관리하시면 됩니다.
          </p>
        </div>
      </section>

      {/* Admin dashboard */}
      <section className="border-t border-border py-10 sm:py-14">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-10">
          <p className="mb-5 text-xs tracking-[0.1em] text-muted-foreground uppercase sm:mb-8">
            주문 관리
          </p>
          <p className="mb-6 max-w-md text-sm text-muted-foreground sm:text-base">
            들어온 주문은 목록에서 한눈에 확인할 수 있어요. 주문을 열면 고객이
            남긴 설명, 픽업 일정, 연락처가 정리되어 있고, 상태를 견적 대기부터
            완료까지 단계별로 업데이트할 수 있습니다.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="relative aspect-[680/610] w-full overflow-hidden rounded-lg border border-border">
              <Image
                src="/for-bakers/admin-orders.jpg"
                alt="주문 목록 화면"
                fill
                className="object-cover object-top"
              />
            </div>
            <div className="relative aspect-[680/520] w-full overflow-hidden rounded-lg border border-border">
              <Image
                src="/for-bakers/admin-order-detail.jpg"
                alt="주문 상세 및 상태 관리 화면"
                fill
                className="object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing — moved from the former standalone /pricing page.
          Plain typography, no cards, no checkmark icons. */}
      <section className="border-t border-border py-10 sm:py-14">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-10">
          <p className="mb-5 text-xs tracking-[0.1em] text-muted-foreground uppercase sm:mb-8">
            이용 요금
          </p>
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
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sign-in CTA */}
      <section className="border-t border-border py-10 sm:py-14">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 px-4 sm:px-10">
          <p className="text-sm text-muted-foreground sm:text-base">
            매장 계정이 있으신가요? 바로 로그인하고 주문을 확인하세요.
          </p>
          <Button asChild>
            <Link href="/login">사장님 로그인</Link>
          </Button>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 border-t border-border px-4 py-8 text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="underline">
          개인정보처리방침
        </Link>
        <span>© {new Date().getFullYear()} Cake Lovers</span>
      </footer>
    </div>
  )
}
