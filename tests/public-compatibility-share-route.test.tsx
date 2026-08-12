import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import nextConfig from "../next.config";
import { projectPublicCompatibilityShare } from "@/application/project-public-compatibility-share";
import { renderPublicCompatibilityShareDocument } from "@/components/public-compatibility-share-document";
import { GET as productionGet } from "@/app/match/[token]/route";
import { DEMO_COMPATIBILITY_REPORT } from "@/presentation/compatibility-demo";
import {
  PUBLIC_COMPATIBILITY_SHARE_READ_MODEL_VERSION,
  toPublicCompatibilityShareReadModel,
} from "@/presentation/public-compatibility-share-read-model";
import {
  BoundedPublicShareLookupGate,
  PUBLIC_SHARE_RESPONSE_HEADERS,
  PUBLIC_SHARE_UNAVAILABLE_MESSAGE,
  createPublicCompatibilityShareHandler,
  createPublicCompatibilityShareResponse,
  loadPublicCompatibilityShare,
  type PublicShareLookupGate,
} from "@/server/public-compatibility-share-route";

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const PAYLOAD = projectPublicCompatibilityShare(DEMO_COMPATIBILITY_REPORT);
const ALLOW_GATE: PublicShareLookupGate = {
  async run(work) {
    return { allowed: true, value: await work() };
  },
};

describe("public compatibility share HTTP boundary", () => {
  it("maps only validated redacted payload fields into an immutable read model", () => {
    const model = toPublicCompatibilityShareReadModel(PAYLOAD);
    expect(model.version).toBe(PUBLIC_COMPATIBILITY_SHARE_READ_MODEL_VERSION);
    expect(model.categories).toHaveLength(5);
    expect(model.factors).toHaveLength(12);
    expect(model.categories[0]).toMatchObject({
      label: "Attraction",
      score: 60,
      scoreText: "60 out of 100",
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.factors[0])).toBe(true);
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("sha256:");
    expect(serialized).not.toContain("synastry:chart-a");
    expect(serialized).not.toContain("sourceVersions");
    expect(serialized).not.toContain("reportPayload");
  });

  it("renders a semantic script-free ready document with separated claims", () => {
    const html = renderPublicCompatibilityShareDocument({
      status: "ready",
      model: toPublicCompatibilityShareReadModel(PAYLOAD),
    });
    expect(html.startsWith('<!doctype html><html lang="en-CA">')).toBe(true);
    expect(html).toContain('<main id="share-content"');
    expect(html).toContain("Attraction: 60 out of 100");
    expect(html.match(/<meter/g)).toHaveLength(5);
    expect(html.match(/Calculated fact<\/p>/g)).toHaveLength(12);
    expect(html.match(/Tradition-framed reflection<\/p>/g)).toHaveLength(12);
    expect(html).not.toContain("<script");
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('property="og:');
    expect(html).not.toContain(TOKEN);
    expect(html).not.toContain("sha256:");
    expect(html).not.toContain("synastry:chart-a");
    expect(
      [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map((match) => match[1]),
    ).toEqual(["#share-content"]);
  });

  it("escapes every payload-derived HTML boundary", () => {
    const model = toPublicCompatibilityShareReadModel(PAYLOAD);
    const hostileModel = {
      ...model,
      title: '<script src="https://attacker.invalid/x.js">',
      summary: "<img src=x onerror=alert(1)> & 'quoted'",
    };
    const html = renderPublicCompatibilityShareDocument({
      status: "ready",
      model: hostileModel,
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script src=&quot;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&amp; &#39;quoted&#39;");
  });

  it("returns the same generic state for malformed, missing, denied, and failed lookups", async () => {
    const resolver = { resolveActivePublic: vi.fn(async () => null) };
    const malformed = await loadPublicCompatibilityShare("malformed", {
      resolver,
      gate: ALLOW_GATE,
    });
    expect(resolver.resolveActivePublic).not.toHaveBeenCalled();

    const missing = await loadPublicCompatibilityShare(TOKEN, {
      resolver,
      gate: ALLOW_GATE,
    });
    const denied = await loadPublicCompatibilityShare(TOKEN, {
      resolver,
      gate: {
        async run() {
          return { allowed: false };
        },
      },
    });
    const failed = await loadPublicCompatibilityShare(TOKEN, {
      resolver: {
        async resolveActivePublic() {
          throw new Error("private infrastructure failure");
        },
      },
      gate: ALLOW_GATE,
    });
    expect(malformed).toEqual(missing);
    expect(missing).toEqual(denied);
    expect(denied).toEqual(failed);
    expect(failed).toEqual({
      status: "unavailable",
      message: PUBLIC_SHARE_UNAVAILABLE_MESSAGE,
    });
  });

  it("bounds concurrent database work without retaining token or caller identity", async () => {
    const gate = new BoundedPublicShareLookupGate(1);
    let release!: (value: string) => void;
    const first = gate.run(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    await Promise.resolve();
    await expect(gate.run(async () => "second")).resolves.toEqual({
      allowed: false,
    });
    release("first");
    await expect(first).resolves.toEqual({ allowed: true, value: "first" });
    await expect(gate.run(async () => "third")).resolves.toEqual({
      allowed: true,
      value: "third",
    });
    expect(() => new BoundedPublicShareLookupGate(0)).toThrow();
    expect(() => new BoundedPublicShareLookupGate(65)).toThrow();
  });

  it("returns hardened active HTML without reflecting the bearer", async () => {
    const handler = createPublicCompatibilityShareHandler({
      resolver: {
        async resolveActivePublic() {
          return PAYLOAD;
        },
      },
      gate: ALLOW_GATE,
    });
    const response = await handler(
      new Request(`http://localhost/match/${TOKEN}`),
      { params: Promise.resolve({ token: TOKEN }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      PUBLIC_SHARE_RESPONSE_HEADERS["Cache-Control"],
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'none'",
    );
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    const html = await response.text();
    expect(html).not.toContain(TOKEN);
    expect(html).not.toContain("sha256:");
  });

  it("maps invalid route parameters to one hardened 404 without database configuration", async () => {
    const response = await productionGet(
      new Request("http://localhost/match/malformed"),
      { params: Promise.resolve({ token: "malformed" }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toContain(
      "This shared comparison is unavailable.",
    );
  });

  it("applies privacy headers at the framework boundary as defense in depth", async () => {
    const rules = await nextConfig.headers!();
    const matchRule = rules.find((rule) => rule.source === "/match/:token");
    expect(matchRule?.headers).toEqual(
      expect.arrayContaining([
        { key: "Referrer-Policy", value: "no-referrer" },
        {
          key: "X-Robots-Tag",
          value: "noindex, nofollow, noarchive, nosnippet",
        },
      ]),
    );
  });

  it("renders one identical unavailable document regardless of cause", async () => {
    const state = {
      status: "unavailable" as const,
      message: PUBLIC_SHARE_UNAVAILABLE_MESSAGE,
    };
    const first = createPublicCompatibilityShareResponse(state);
    const second = createPublicCompatibilityShareResponse(state);
    expect(first.status).toBe(404);
    expect(await first.text()).toBe(await second.text());
  });
});
