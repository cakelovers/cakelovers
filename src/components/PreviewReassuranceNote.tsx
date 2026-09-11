// Shown on every step before Reference Images (Generate/Regenerate/
// Select Preview) — reassures the customer that an imperfect AI draft
// isn't the end of the road, and previews the next step so they aren't
// surprised by it.
export function PreviewReassuranceNote() {
  return (
    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
      AI 시안이 완벽하지 않아도 괜찮아요.
      <br />
      다음 단계에서 참고사진을 최대 3장까지 업로드할 수 있습니다.
    </p>
  )
}
