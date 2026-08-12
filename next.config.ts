import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/match/:token",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; style-src 'self'; img-src 'none'; font-src 'none'; script-src 'none'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          },
        ],
      },
      {
        source: "/api/webhooks/paddle",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
