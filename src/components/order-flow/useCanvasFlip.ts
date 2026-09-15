"use client"

import { useLayoutEffect, useRef, type RefObject } from "react"

const DURATION_MS = 400
const EASE = "cubic-bezier(.22,1,.36,1)"

// FLIP (First, Last, Invert, Play) for the persistent order canvas.
// Runs after every render and compares the canvas element's current
// geometry to its geometry on the previous render. In practice this
// only differs on the step transitions that change OrderCanvas's
// `compact` size (into/out of Pickup) — every other render is a no-op
// here. When it does differ, this fakes the *old* position/size with a
// `transform`, forces a reflow, then transitions to identity.
//
// The element's actual width/height never animate — only `transform`,
// so this is compositor-only and doesn't trigger layout on every
// frame. It's also the same DOM node throughout (OrderWizard never
// remounts OrderCanvas — see P0 #1), so this is a true shared-element
// transition, not two elements crossfading.
export function useCanvasFlip(ref: RefObject<HTMLDivElement | null>) {
  const prevRect = useRef<DOMRect | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const last = el.getBoundingClientRect()
    const first = prevRect.current
    prevRect.current = last

    const changed =
      first !== null &&
      (first.width !== last.width ||
        first.height !== last.height ||
        first.top !== last.top ||
        first.left !== last.left)

    if (!changed || !first) return

    // A viewer who has asked the OS for reduced motion gets the same
    // end state instantly, with no transform animation — the resize
    // still happens, it's just not animated.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    const dx = first.left - last.left
    const dy = first.top - last.top
    const sx = first.width / last.width
    const sy = first.height / last.height

    el.style.transformOrigin = "top left"
    el.style.transition = "none"
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
    void el.offsetHeight // force a reflow so the line above commits before the transition below is attached
    el.style.transition = `transform ${DURATION_MS}ms ${EASE}`
    el.style.transform = "none"

    const timer = setTimeout(() => {
      el.style.transition = ""
      el.style.transform = ""
      el.style.transformOrigin = ""
    }, DURATION_MS)

    return () => clearTimeout(timer)
  })
}
