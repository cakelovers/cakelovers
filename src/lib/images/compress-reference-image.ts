"use client"

// Client-side reference-photo compression, run in the browser before a
// photo is ever uploaded.
//
// Why this exists: phone camera photos are routinely 8-30MB (PNG
// especially — it's lossless, so photographic content never shrinks).
// That blows past two separate limits on the upload path:
//   1. this app's 4MiB per-file check in
//      src/app/api/stores/[storeSlug]/reference-images/save/route.ts
//      (returns 400 reference_too_large), and
//   2. Vercel's fixed 4.5MB serverless request-body limit, which the
//      platform enforces with a 413 FUNCTION_PAYLOAD_TOO_LARGE BEFORE
//      the route handler runs — so it can't be caught or reworded
//      server-side, and it can't be raised on any plan.
//
// Reference photos only need to convey colour and style, not archival
// detail, so we downscale the longest edge to `maxEdge` and re-encode
// as JPEG — typically a 10-30x size reduction — so every upload lands
// comfortably under both limits.
//
// Best-effort by design: any decode/encode failure (e.g. a browser that
// can't decode HEIC at all) returns the original File unchanged. That is
// safe because the upload route
// (src/app/api/stores/[storeSlug]/reference-images/save/route.ts) now
// re-runs the same downscale-to-JPEG server-side via
// src/lib/storage/normalize-image.ts, so a browser that can't decode
// HEIC no longer means a lost photo. ReferenceImagesStep still rejects
// obviously-unsupported formats up front so the customer gets an
// immediate, actionable error rather than a failure at submit time.

const DEFAULT_MAX_EDGE = 1600
// Target well under the app's 4MiB check and Vercel's 4.5MB ceiling,
// leaving room for multipart overhead.
const DEFAULT_TARGET_BYTES = 3 * 1024 * 1024
const DEFAULT_INITIAL_QUALITY = 0.82
const DEFAULT_MIN_QUALITY = 0.5

// A photo already this small in a browser-friendly lossy format isn't
// worth re-encoding — it would only discard quality for no meaningful
// size win.
const SKIP_IF_UNDER_BYTES = 600 * 1024
const ALREADY_WEB_SAFE = new Set(["image/jpeg", "image/webp"])

export interface CompressReferenceImageOptions {
  maxEdge?: number
  targetBytes?: number
  initialQuality?: number
  minQuality?: number
}

export async function compressReferenceImage(
  file: File,
  options: CompressReferenceImageOptions = {}
): Promise<File> {
  if (typeof window === "undefined") return file
  // An empty type is common for HEIC picked from a file provider — let
  // it through to the decode attempt rather than shipping it raw.
  if (file.type && !file.type.startsWith("image/")) return file
  if (file.size <= SKIP_IF_UNDER_BYTES && ALREADY_WEB_SAFE.has(file.type)) {
    return file
  }

  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE
  const targetBytes = options.targetBytes ?? DEFAULT_TARGET_BYTES
  const initialQuality = options.initialQuality ?? DEFAULT_INITIAL_QUALITY
  const minQuality = options.minQuality ?? DEFAULT_MIN_QUALITY

  let source: ImageBitmap | HTMLImageElement | null = null
  try {
    source = await decode(file)
    const [naturalWidth, naturalHeight] = dimensions(source)
    if (!naturalWidth || !naturalHeight) return file

    const { width, height } = fitWithin(naturalWidth, naturalHeight, maxEdge)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)

    let quality = initialQuality
    let blob = await toJpegBlob(canvas, quality)
    while (blob && blob.size > targetBytes && quality > minQuality) {
      quality = Math.max(minQuality, Math.round((quality - 0.12) * 100) / 100)
      blob = await toJpegBlob(canvas, quality)
    }

    // If re-encoding didn't actually help (already-tiny JPEG, or a
    // format we couldn't beat), keep the original.
    if (!blob || blob.size >= file.size) return file

    return new File([blob], toJpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    })
  } catch {
    return file
  } finally {
    if (source && typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
      source.close()
    }
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` applies the EXIF orientation, so a photo taken in
      // portrait isn't uploaded sideways.
      return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
      // Fall through — some browsers can't decode HEIC via
      // createImageBitmap but can via an <img> element.
    }
  }
  return await decodeViaImageElement(file)
}

function decodeViaImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not decode image"))
    }
    img.src = url
  })
}

function dimensions(source: ImageBitmap | HTMLImageElement): [number, number] {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return [source.naturalWidth, source.naturalHeight]
  }
  return [source.width, source.height]
}

function fitWithin(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality)
  })
}

function toJpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "").trim()
  return `${base || "reference"}.jpg`
}
