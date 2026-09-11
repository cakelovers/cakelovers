// Shown wherever an AI-generated preview image is displayed to a
// customer (generate/regenerate/select steps, and the public order
// tracking page) — approved wording, do not vary by location.
export function AiPreviewDisclaimer() {
  return (
    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
      • AI 시안은 분위기 참고용이며, 글씨가 다소 뭉개져 보일 수 있습니다.
      <br />
      • 실제 케이크는 입력하신 레터링 문구와 요청사항을 바탕으로 정성껏 제작됩니다.
    </p>
  )
}
