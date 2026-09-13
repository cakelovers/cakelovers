import type { Metadata } from "next";
import { Gowun_Dodum, Geist_Mono, Alex_Brush } from "next/font/google";
import "./globals.css";

// `variable` must be exactly "--font-sans" to match globals.css's
// `@theme inline { --font-sans: var(--font-sans); }` — the previous font
// here was wired as "--font-geist-sans", which never actually matched
// that theme binding, so body text was silently falling back to
// Tailwind's default sans stack rather than rendering in Geist at all.
//
// Gowun Dodum also ships only a single (400) weight — existing
// font-semibold / font-bold utility classes across the app fall back to
// the browser's synthetic bold for this face rather than a true bold
// cut. This is a known, accepted tradeoff of the brand typography
// decision, not a bug.
const gowunDodum = Gowun_Dodum({
  variable: "--font-sans",
  weight: "400",
  subsets: ["latin"],
});

// Kept for the one monospace use in the app (the order id shown via
// `font-mono` in ReviewStep.tsx) — Gowun Dodum has no monospace cut.
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
        className={`${gowunDodum.variable} ${geistMono.variable} ${alexBrush.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
