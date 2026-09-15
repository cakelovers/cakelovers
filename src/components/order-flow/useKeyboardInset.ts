"use client"

import { useEffect, useState } from "react"

// Tracks how many pixels of the layout viewport are currently covered
// by an on-screen keyboard (0 when none is open), using the
// VisualViewport API.
//
// Why this matters: the wizard's action bar is `position: fixed; bottom:
// 0`, whose containing block is the layout viewport — which does NOT
// shrink when a mobile keyboard opens (only the visual viewport does).
// On iOS Safari in particular this means a naive `bottom: 0` element can
// end up rendered underneath the keyboard, invisible, exactly where the
// primary action button lives. Feature-detected — browsers without
// VisualViewport (effectively none still in use) simply get 0 and the
// footer behaves as it did before this existed.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function update() {
      // window.innerHeight is the layout viewport; vv.height + vv.offsetTop
      // is the visible slice of it. The gap between them is what's
      // covered — by the keyboard, when one is open.
      const gap = window.innerHeight - vv!.height - vv!.offsetTop
      setInset(Math.max(0, Math.round(gap)))
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [])

  return inset
}
