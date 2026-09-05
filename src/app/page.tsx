import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Describe your cake",
    description: "Tell us the flavor, colors, theme — whatever you have in mind, in plain words.",
  },
  {
    step: "2",
    title: "See an AI preview",
    description: "Get a real preview image generated from your description in seconds, and regenerate until it's right.",
  },
  {
    step: "3",
    title: "Pick a pickup time",
    description: "Choose a date and time, add any extra notes for the shop, and submit.",
  },
  {
    step: "4",
    title: "The shop bakes it",
    description: "Your shop sees exactly what you approved — no back-and-forth over DMs — and gets it ready for pickup.",
  },
]

const SHOP_BENEFITS = [
  {
    title: "One place for every order",
    description: "No more scattered screenshots across Instagram DMs and text messages.",
  },
  {
    title: "See the approved design up front",
    description: "Every order arrives with the exact AI preview the customer picked, plus any reference photos.",
  },
  {
    title: "A simple status pipeline",
    description: "Move each order forward as you work on it, from new through to ready for pickup.",
  },
]

const PRICING_PLANS = [
  {
    name: "Basic",
    price: "₩19,000",
    description: "For a single shop just getting started with online cake orders.",
    features: [
      "Customer ordering wizard",
      "AI cake preview generation",
      "Order dashboard for your shop",
      "Order status tracking",
    ],
  },
  {
    name: "Pro",
    price: "₩49,000 ~ ₩59,000",
    description: "For shops that want more room to grow.",
    features: [
      "Everything in Basic",
      "Higher AI preview generation limits",
      "Priority support",
      "Early access to new features",
    ],
    highlighted: true,
  },
]

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-lg font-semibold">🎂 Cake Lovers</span>
        <Link href="/login" className="text-sm text-muted-foreground underline">
          Shop owner sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-16 text-center sm:py-24">
        <Badge variant="secondary">AI-powered custom cake ordering</Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Design your dream cake before you order it.
        </h1>
        <p className="max-w-xl text-balance text-muted-foreground sm:text-lg">
          Describe the cake you want, get an AI-generated preview in seconds,
          and send your order straight to a local cake shop — no more
          guesswork on either side.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/s/demo-store/order">Start Designing</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Cake Shop Demo</Link>
          </Button>
        </div>
      </section>

      {/* AI cake generation feature */}
      <section className="mx-auto w-full max-w-3xl px-4 py-12">
        <Card>
          <CardHeader>
            <Badge className="w-fit">AI Preview</Badge>
            <CardTitle className="text-2xl">
              See your cake before anyone bakes it
            </CardTitle>
            <CardDescription>
              Just describe what you want in your own words — no design
              skills needed. Our AI generates a realistic preview image, and
              you can regenerate as many times as you like until it matches
              what&apos;s in your head. Only the design you actually pick
              ever gets sent to the shop.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-4xl px-4 py-12">
        <h2 className="mb-8 text-center text-2xl font-semibold">How it works</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((item) => (
            <div key={item.step} className="flex flex-col gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {item.step}
              </div>
              <h3 className="font-medium">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits for shop owners */}
      <section className="mx-auto w-full max-w-4xl px-4 py-12">
        <h2 className="mb-8 text-center text-2xl font-semibold">
          Built for cake shop owners
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {SHOP_BENEFITS.map((benefit) => (
            <Card key={benefit.title}>
              <CardHeader>
                <CardTitle className="text-base">{benefit.title}</CardTitle>
                <CardDescription>{benefit.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto w-full max-w-4xl px-4 py-12">
        <h2 className="mb-8 text-center text-2xl font-semibold">
          Pricing for shop owners
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {PRICING_PLANS.map((plan) => (
            <Card key={plan.name} className={plan.highlighted ? "border-primary" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.highlighted && <Badge>Popular</Badge>}
                </div>
                <p className="text-2xl font-bold">
                  {plan.price}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ul className="flex flex-col gap-1.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="text-primary">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant={plan.highlighted ? "default" : "outline"}>
                  <Link href="/login">Get Started</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center">
        <h2 className="text-2xl font-semibold">Ready to order or run a shop?</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/s/demo-store/order">Start Designing</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Cake Shop Demo</Link>
          </Button>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Cake Lovers
      </footer>
    </div>
  )
}
