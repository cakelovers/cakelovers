import type { Metadata } from "next";
import { Gowun_Batang, Geist_Mono, Alex_Brush } from "next/font/google";
import "./globals.css";

// One UI typeface for the entire app — Gowun Batang, bound to
// `--font-sans` so every existing `font-sans`/default-inherited element
// (headings, body copy, buttons, labels, everywhere) renders in it with
// no per-component overrides needed. `variable` must be exactly
// "--font-sans" to match globals.css's
// `@theme inline { --font-sans: var(--font-sans); }`. Loaded at both
// 400 and 700 so existing font-semibold/font-bold usages get a true
// bold cut instead of synthetic bold.
const gowunBatang = Gowun_Batang({
  variable: "--font-sans",
  weight: ["400", "700"],
  subsets: ["latin"],
});

// Kept for the one monospace use in the app (the order id shown via
// `font-mono` in ReviewStep.tsx) — Gowun Batang has no monospace cut.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Script wordmark only — echoes the cursive lettering piped onto the
// approved hero cake. Scoped to the "Cake Lovers" logotype via
// `font-script` (see globals.css). Not used for any headline or body
// string.
const alexBrush = Alex_Brush({
  variable: "--font-script",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cake Lovers",
  description: "Custom cake ordering for local cake shops.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${gowunBatang.variable} ${geistMono.variable} ${alexBrush.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
