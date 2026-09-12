"use client"

import { useState, type FormEvent } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Fixed, not derived from window.location.origin: this app can be
// reached through more than one Vercel host (production, and any
// preview deployment), and window.location.origin resolves to
// whichever one the browser happens to be on. Since that value gets
// baked into the magic link Supabase emails, a login started from a
// preview host would set the resulting session cookie on that preview
// host — invisible to the production admin panel, and vice versa.
// Pinning this to the one canonical production host means every
// magic link, regardless of where it was requested from, always signs
// the store owner in on production.
const CANONICAL_SITE_URL = "https://cakelovers-ashen.vercel.app"

// Supabase's own SDK error messages arrive in English — this is the one
// string in the app that can't be fixed with a direct literal edit.
// Known cases get a Korean equivalent; anything unrecognized (a future
// SDK message this list doesn't yet cover) falls back to one generic
// Korean sentence rather than ever surfacing raw English.
function mapAuthErrorToKorean(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return "올바른 이메일 주소를 입력해 주세요."
  }
  return "로그인 중 문제가 발생했습니다. 다시 시도해 주세요."
}

// Shop owner / staff sign-in only. Magic-link (OTP), no password — see
// docs/05_MVP_Implementation_Plan.md §6.2. Customers never see this page.
export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${CANONICAL_SITE_URL}/auth/callback` },
    })

    setIsSubmitting(false)

    if (signInError) {
      setError(mapAuthErrorToKorean(signInError.message))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-2 p-6 text-center">
        <h1 className="text-lg font-semibold">이메일을 확인해 주세요</h1>
        <p className="text-sm text-muted-foreground">
          {email} 주소로 로그인 링크를 보내드렸어요.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">사장님 로그인</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "전송 중…" : "로그인 링크 보내기"}
        </Button>
      </form>
    </div>
  )
}
