// Single guidance block shown on the AI Preview step — replaces the
// prior two separate boxes (disclaimer + reassurance note). Approved
// wording, do not vary by location or split back into multiple boxes.
export function AiPreviewGuidance() {
  return (
    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
      💡 AI 시안은 분위기 참고용이에요
      <br />
      글씨 뭉개짐이나 디테일은 실제 제작 시 입력하신 레터링 문구와 참고 사진(최대
      3장)을 기준으로 반영됩니다.
    </p>
  )
}
