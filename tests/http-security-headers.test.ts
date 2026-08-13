import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import nextConfig from "../next.config";
import {
  GLOBAL_BROWSER_SECURITY_HEADERS,
  PRIVATE_NO_STORE_HEADERS,
  STRICT_API_CONTENT_SECURITY_POLICY,
  STRICT_SHARE_CONTENT_SECURITY_POLICY,
} from "@/config/http-security";
import { BETTER_AUTH_HTTP_RESPONSE_HEADERS } from "@/server/better-auth-http";
import { PADDLE_WEBHOOK_RESPONSE_HEADERS } from "@/server/paddle-webhook-http";
import { PUBLIC_SHARE_RESPONSE_HEADERS } from "@/server/public-compatibility-share-route";

describe("central HTTP security header policy", () => {
  it("applies one conservative browser baseline to every framework response", async () => {
    const rules = await nextConfig.headers!();
    const global = rules.find((rule) => rule.source === "/:path*");
    expect(
      Object.fromEntries(global!.headers.map(({ key, value }) => [key, value])),
    ).toEqual(GLOBAL_BROWSER_SECURITY_HEADERS);
    expect(global?.headers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Strict-Transport-Security" }),
        expect.objectContaining({ key: "Content-Security-Policy" }),
      ]),
    );
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("retains stricter no-store and CSP policies on sensitive routes", async () => {
    const rules = await nextConfig.headers!();
    const share = Object.fromEntries(
      rules
        .find((rule) => rule.source === "/match/:token")!
        .headers.map(({ key, value }) => [key, value]),
    );
    const webhook = Object.fromEntries(
      rules
        .find((rule) => rule.source === "/api/webhooks/paddle")!
        .headers.map(({ key, value }) => [key, value]),
    );
    expect(share).toMatchObject({
      ...GLOBAL_BROWSER_SECURITY_HEADERS,
      ...PRIVATE_NO_STORE_HEADERS,
      "Content-Security-Policy": STRICT_SHARE_CONTENT_SECURITY_POLICY,
    });
    expect(webhook).toMatchObject({
      ...GLOBAL_BROWSER_SECURITY_HEADERS,
      ...PRIVATE_NO_STORE_HEADERS,
      "Content-Security-Policy": STRICT_API_CONTENT_SECURITY_POLICY,
    });
    expect(BETTER_AUTH_HTTP_RESPONSE_HEADERS).toMatchObject({
      ...GLOBAL_BROWSER_SECURITY_HEADERS,
      ...PRIVATE_NO_STORE_HEADERS,
      "Content-Security-Policy": STRICT_API_CONTENT_SECURITY_POLICY,
    });
    expect(PADDLE_WEBHOOK_RESPONSE_HEADERS).toMatchObject(webhook);
    expect(PUBLIC_SHARE_RESPONSE_HEADERS).toMatchObject(share);
  });

  it("keeps every centralized name and value bounded and injection-free", () => {
    for (const policy of [
      GLOBAL_BROWSER_SECURITY_HEADERS,
      PRIVATE_NO_STORE_HEADERS,
    ]) {
      for (const [name, value] of Object.entries(policy)) {
        expect(name.length).toBeLessThanOrEqual(64);
        expect(value.length).toBeLessThanOrEqual(512);
        expect(`${name}${value}`).not.toMatch(/[\r\n]/);
      }
    }
  });
});
