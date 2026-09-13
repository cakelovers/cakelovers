import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const ORDER_STORY = [
  {
    step: "01",
    title: "설명 작성",
    description: "원하는 모습을 자유롭게 적어주세요.",
  },
  {
    step: "02",
    title: "AI 미리보기",
    description: "주문 전에 먼저 확인하세요.",
  },
  {
    step: "03",
    title: "완성 케이크",
    description: "가까운 매장에서 픽업하세요.",
  },
]

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

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <span className="text-sm font-bold tracking-[0.12em]">CAKE LOVERS</span>
        <Link href="/login" className="text-xs text-muted-foreground">
          사장님 로그인
        </Link>
      </header>

      {/* Hero — the approved campaign photograph is the brand's primary
          visual identity. It must dominate the composition; headline,
          subcopy, and the single CTA sit over it as the only other
          elements, no decorative graphics of any kind. */}
      <section className="relative h-[85vh] min-h-[560px] w-full overflow-hidden">
        <Image
          src="/hero-cake.jpg"
          alt="Cake Lovers 시그니처 케이크"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-primary/80 via-primary/10 to-transparent p-6 sm:p-12">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6">
            <div>
              <h1 className="text-3xl leading-snug font-bold text-primary-foreground sm:text-5xl">
                주문제작 케이크를
                <br />
                더 편하게.
              </h1>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-primary-foreground/85">
                원하는 모습을 적기만 하면,
                <br />
                나머지는 저희가 준비할게요.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/s/demo-store/order">케이크 주문하기</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Order story — real photography at each step, not icons. */}
      <section className="border-t border-border py-14">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-10">
          <p className="mb-8 text-xs tracking-[0.1em] text-muted-foreground uppercase">
            이렇게 주문해요
          </p>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
            {ORDER_STORY.map((item) => (
              <div key={item.step} className="flex flex-col gap-3 bg-card p-6">
                {/* Photo placeholder for this step — real photography TBD */}
                <div className="aspect-[4/3] w-full rounded-lg bg-muted" />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{item.step}</p>
                  <h3 className="mt-1 font-medium">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — plain typography, no cards or checkmark icons. */}
      <section className="border-t border-border py-14">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-10">
          <p className="mb-8 text-xs tracking-[0.1em] text-muted-foreground uppercase">
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
                <Button asChild variant={plan.highlighted ? "default" : "outline"} className="mt-2 self-start">
                  <Link href="/login">시작하기</Link>
                </Button>
              </div>
            ))}
          </div>
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
