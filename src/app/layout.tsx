import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Personal Cosmic Calendar",
    template: "%s | Personal Cosmic Calendar",
  },
  description:
    "A deterministic astrology, lunar, and numerology intelligence platform in development.",
  referrer: "no-referrer",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
