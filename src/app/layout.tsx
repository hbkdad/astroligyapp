import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { loadPublicSiteConfiguration } from "@/config/public-site";

const publicSite = loadPublicSiteConfiguration();

export const metadata: Metadata = {
  title: {
    default: "Personal Cosmic Calendar",
    template: "%s | Personal Cosmic Calendar",
  },
  description:
    "A deterministic astrology, lunar, and numerology intelligence platform in development.",
  metadataBase: new URL(publicSite.origin),
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
