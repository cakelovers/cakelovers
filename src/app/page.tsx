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

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header — the script wordmark is the brand logotype (echoes the
          cursive lettering piped onto the hero cake); every other string
          on this page stays on Gowun Dodum. */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <span className="font-script text-4xl leading-none text-primary">Cake Lovers</span>
        <Link href="/login" className="text-xs text-muted-foreground">
          사장님 로그인
        </Link>
      </header>

      {/* Hero — the approved campaign photograph is the brand's primary
          visual identity. It must dominate the composition; headline,
          subcopy, and the single CTA sit over it as the only other
          elements, no decorative graphics of any kind. The section is
          sized to the photo's own 11:6 aspect ratio (2816x1536) rather
          than a fixed viewport height, so object-cover fills the frame
          exactly with no cropping — the layout adapts to the photograph,
          not the other way around. */}
      <section className="relative aspect-[11/6] w-full overflow-hidden">
        <Image
          src="/KakaoTalk_20260913_225801379.jpg"
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

      {/* For bakers — a quiet utility footnote, not a second hero: same
          restrained scale as body copy, a hairline underline instead of
          a heading treatment, low-emphasis outline buttons. No card, no
          pricing table. Full plan details live on /pricing. */}
      <section className="border-t border-border py-14">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 px-4 sm:px-10">
          <p className="inline-block border-b border-foreground/15 pb-3 text-sm leading-relaxed text-foreground">
            Cake Lovers와 함께
            <br />
            주문을 관리해보세요.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/login">사장님 로그인</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/pricing">이용 요금 보기</Link>
            </Button>
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
