// Shown wherever an AI-generated preview image is displayed to a
// customer (generate/regenerate/select steps, and the public order
// tracking page) — approved wording, do not vary by location.
export function AiPreviewDisclaimer() {
  return (
    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
      AI 이미지는 참고용이며, 실제 제작은 설명·참고 사진 기준입니다.
      <br />
      글자·장식은 실제와 다소 다를 수 있습니다.
    </p>
  )
}
