// Server-only. Decodes a `data:<mime>;base64,<data>` URL (the shape the
// AI preview route returns) into raw bytes ready for a Storage upload.

export interface DecodedDataUrl {
  buffer: Buffer
  contentType: string
}

export function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) {
    throw new Error("Not a valid base64 data URL")
  }
  const [, contentType, base64] = match
  return { buffer: Buffer.from(base64, "base64"), contentType }
}
