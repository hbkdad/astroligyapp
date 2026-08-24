import type { NextConfig } from "next";
import { resolve } from "node:path";
import {
  GLOBAL_BROWSER_SECURITY_HEADERS,
  PRIVATE_NO_STORE_HEADERS,
  STRICT_API_CONTENT_SECURITY_POLICY,
  STRICT_SHARE_CONTENT_SECURITY_POLICY,
  nextHeaders,
} from "./src/config/http-security";

const sharedCacheEnabled = process.env.NEXT_SHARED_CACHE_ENABLED === "true";
const configuredDeploymentId = deploymentId(process.env.NEXT_DEPLOYMENT_ID);

const nextConfig: NextConfig = {
  output: "standalone",
  ...(configuredDeploymentId === undefined
    ? {}
    : {
        deploymentId: configuredDeploymentId,
        generateBuildId: async () => configuredDeploymentId,
      }),
  ...(sharedCacheEnabled
    ? {
        cacheHandler: resolve(process.cwd(), "cache-handler.cjs"),
        cacheMaxMemorySize: 0,
      }
    : {}),
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

function deploymentId(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{6,127}$/.test(value)) {
    throw new Error(
      "NEXT_DEPLOYMENT_ID must be 7-128 URL-safe characters and start with a letter or digit",
    );
  }
  return value;
}
