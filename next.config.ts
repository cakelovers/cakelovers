import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these server-only image libraries out of the webpack bundle so
  // they're traced and copied as real node_modules into the serverless
  // function. heic-convert pulls a large libheif WASM blob that webpack
  // can't statically analyse (it uses a runtime require); sharp ships
  // platform-specific native binaries. Both must resolve at runtime on
  // Vercel's Node.js runtime for reference-images/save to normalize
  // HEIC uploads.
  serverExternalPackages: ["sharp", "heic-convert"],
};

export default nextConfig;
