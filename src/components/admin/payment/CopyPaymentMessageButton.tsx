"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { markPaymentRequested } from "@/app/admin/[storeSlug]/orders/[orderId]/actions"

interface CopyPaymentMessageButtonProps {
  storeSlug: string
  orderId: string
  message: string
}

export function CopyPaymentMessageButton({
  storeSlug,
  orderId,
  message,
}: CopyPaymentMessageButtonProps) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCopy() {
    setError(null)
    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(message)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      } catch {
        setError("클립보드 복사에 실패했습니다. 아래 메시지를 직접 복사해 주세요.")
        return
      }
      // Best-effort: stamps payment_requested_at the first time only.
      await markPaymentRequested(storeSlug, orderId)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleCopy} disabled={isPending}>
          {isPending ? "복사 중…" : "결제 메시지 복사"}
        </Button>
        {copied && <span className="text-sm text-muted-foreground">복사되었습니다</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">메시지 미리보기</summary>
        <pre className="mt-2 max-w-md whitespace-pre-wrap rounded border bg-muted/40 p-2 text-xs">
          {message}
        </pre>
      </details>
    </div>
  )
}
