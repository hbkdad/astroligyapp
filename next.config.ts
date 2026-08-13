import type { NextConfig } from "next";
import {
  GLOBAL_BROWSER_SECURITY_HEADERS,
  PRIVATE_NO_STORE_HEADERS,
  STRICT_API_CONTENT_SECURITY_POLICY,
  STRICT_SHARE_CONTENT_SECURITY_POLICY,
  nextHeaders,
} from "./src/config/http-security";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: nextHeaders(GLOBAL_BROWSER_SECURITY_HEADERS),
      },
      {
        source: "/match/:token",
        headers: nextHeaders({
          ...GLOBAL_BROWSER_SECURITY_HEADERS,
          ...PRIVATE_NO_STORE_HEADERS,
          "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
          "Content-Security-Policy": STRICT_SHARE_CONTENT_SECURITY_POLICY,
        }),
      },
      {
        source: "/api/webhooks/paddle",
        headers: nextHeaders({
          ...GLOBAL_BROWSER_SECURITY_HEADERS,
          ...PRIVATE_NO_STORE_HEADERS,
          "Content-Security-Policy": STRICT_API_CONTENT_SECURITY_POLICY,
        }),
      },
    ];
  },
};

export default nextConfig;
