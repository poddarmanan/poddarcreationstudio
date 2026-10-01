import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { KeyboardInset } from "@/components/KeyboardInset";

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const jost = Jost({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Poddar Creation Studio",
  description: "A digital showroom for wholesale dyed fabrics — nine qualities, hundreds of shades, a showroom that never closes.",
};

/**
 * `viewportFit: 'cover'` lets the page draw under a notch and, crucially, makes
 * `env(safe-area-inset-bottom)` report a real number — without it the bottom
 * navigation pill sits under the home indicator on an iPhone. The theme colour
 * tints the browser chrome to the studio's cream so the bar above the page does
 * not read as a different application.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf8f5",
  // Where the browser supports it (Chrome on Android), the keyboard shrinks the page rather than
  // covering it. Safari on an iPhone does not; KeyboardInset handles that.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jost.variable}`}>
      <body style={{ fontFamily: "var(--font-body), sans-serif" }}>
        <KeyboardInset />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
