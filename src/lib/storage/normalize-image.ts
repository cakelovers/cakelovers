// Server-only. Normalizes an arbitrary uploaded image to a web-safe,
// right-sized JPEG so nothing downstream has to care what the browser
// managed — or failed — to hand us.
//
// Why this exists: the client
// (src/lib/images/compress-reference-image.ts) already downscales and
// re-encodes to JPEG every reference photo it can DECODE. But a browser
// that can't decode HEIC/HEIF at all — every non-Safari engine — falls
// back to sending the original file untouched. That file then failed the
// route's MIME allowlist (extensionForMimeType returned null → 400
// invalid_reference_type) and the photo was silently dropped from the
// order. This module is the backstop that removes the browser dependency:
// it decodes HEIC via a pure-JS libheif build (no native platform
// package, so it works on Vercel's serverless runtime) and everything
// else via sharp, then always emits image/jpeg.

import convertHeic from "heic-convert"
import sharp from "sharp"

// Longest edge for a server-normalized photo. Matches DEFAULT_MAX_EDGE in
// the client compressor — a reference photo only needs to convey colour
// and style, not archival detail.
export const NORMALIZED_MAX_EDGE = 1600
const JPEG_QUALITY = 82

export interface NormalizedImage {
  buffer: Buffer
  contentType: "image/jpeg"
  extension: "jpg"
}

// HEIC/HEIF containers are ISO base media files: bytes 4..8 are the
// "ftyp" box tag and bytes 8..12 are the major brand. Phone pickers
// frequently report these files with an empty or plain wrong MIME type,
// so sniff the bytes instead of trusting the declared type.
const HEIC_BRANDS = new Set([
  "heic", "heix", "heim", "heis",
  "hevc", "hevx", "hevm", "hevs",
  "mif1", "msf1", "heif",
])

export function looksLikeHeic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  if (buffer.toString("latin1", 4, 8) !== "ftyp") return false
  const brand = buffer.toString("latin1", 8, 12).toLowerCase()
  return HEIC_BRANDS.has(brand)
}

// Decodes `input` (any format sharp or libheif can read) and returns a
// downscaled JPEG. Throws if the bytes can't be decoded as an image at
// all — the caller turns that into a 4xx the customer can act on rather
// than a silently missing photo.
export async function normalizeToJpeg(input: Buffer): Promise<NormalizedImage> {
  let raster = input

  if (looksLikeHeic(input)) {
    // heic-convert returns a full-resolution JPEG; the sharp pass below
    // does the actual downscale so sizing is identical to the non-HEIC
    // path. `Uint8Array.from` copies into a plain view heic-convert
    // accepts regardless of the Node Buffer brand.
    const jpeg = await convertHeic({
      buffer: Uint8Array.from(input),
      format: "JPEG",
      quality: JPEG_QUALITY / 100,
    })
    raster = Buffer.from(jpeg)
  }

  const buffer = await sharp(raster, { failOn: "none" })
    // No-arg .rotate() bakes in the EXIF orientation, so a photo taken in
    // portrait isn't stored sideways once the tag is discarded.
    .rotate()
    .resize({
      width: NORMALIZED_MAX_EDGE,
      height: NORMALIZED_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer()

  return { buffer, contentType: "image/jpeg", extension: "jpg" }
}
