"use client"

import { useState, useTransition } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { updateInternalNote } from "@/app/admin/[storeSlug]/orders/[orderId]/actions"

interface InternalNoteFormProps {
  storeSlug: string
  orderId: string
  initialNote: string
}

export function InternalNoteForm({ storeSlug, orderId, initialNote }: InternalNoteFormProps) {
  const [note, setNote] = useState(initialNote)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateInternalNote(storeSlug, orderId, note)
      if (result?.error) {
        setError(result.error)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="internal-note">Internal note (staff only)</Label>
      <Textarea
        id="internal-note"
        rows={3}
        value={note}
        onChange={(e) => {
          setNote(e.target.value)
          setSaved(false)
        }}
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save note"}
        </Button>
        {saved && !isPending && <span className="text-sm text-muted-foreground">Saved</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
