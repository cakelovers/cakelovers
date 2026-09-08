// Shown wherever an AI-generated preview image is displayed to a
// customer (generate/regenerate/select steps, and the public order
// tracking page) — approved wording, do not vary by location.
export function AiPreviewDisclaimer() {
  return (
    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
      AI 시안의 글자가 깨져 보일 수 있으나 실제 제작에는 문제가 없습니다.
      <br />
      실제 케이크는 설명과 참고사진을 기준으로 제작됩니다.
    </p>
  )
}
