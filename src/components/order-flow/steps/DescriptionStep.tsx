"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface DescriptionStepProps {
  value: string
  onChange: (value: string) => void
}

export function DescriptionStep({ value, onChange }: DescriptionStepProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">케이크를 설명해 주세요</h2>
        <p className="text-sm text-muted-foreground">
          맛, 색상, 테마 등 원하시는 내용을 자유롭게 적어주세요.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">디자인 설명</Label>
        <Textarea
          id="description"
          placeholder="예: 2단 바닐라 케이크, 핑크색 버터크림 꽃 장식, 위에 '민아 생일 축하해' 문구"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
          rows={6}
        />
        <p className="text-right text-xs text-muted-foreground">{value.length} / 500</p>
      </div>
    </div>
  )
}
