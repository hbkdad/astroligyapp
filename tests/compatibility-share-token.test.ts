import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  COMPATIBILITY_SHARE_TOKEN_ENTROPY_BYTES,
  COMPATIBILITY_SHARE_TOKEN_VERSION,
  createCompatibilityShareGrant,
  digestCompatibilityShareToken,
  evaluateCompatibilityShareAccess,
  generateCompatibilityShareToken,
  matchesCompatibilityShareToken,
  revokeCompatibilityShareGrant,
} from "@/security/compatibility-share-token";

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_TOKEN = "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const EXPIRY = "2030-01-01T00:00:00.000Z";

describe("compatibility share token contract", () => {
  it("generates canonical opaque tokens with 256 bits of random entropy", () => {
    const tokens = new Set(
      Array.from({ length: 64 }, () => generateCompatibilityShareToken()),
    );
    expect(COMPATIBILITY_SHARE_TOKEN_ENTROPY_BYTES).toBe(32);
    expect(tokens.size).toBe(64);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
    }
  });

  it("domain-separates a one-way digest and compares without accepting malformed input", () => {
    const digest = digestCompatibilityShareToken(TOKEN);
    expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(digest).not.toContain(TOKEN);
    expect(matchesCompatibilityShareToken(TOKEN, digest)).toBe(true);
    expect(matchesCompatibilityShareToken(OTHER_TOKEN, digest)).toBe(false);
    expect(matchesCompatibilityShareToken("short", digest)).toBe(false);
    expect(
      matchesCompatibilityShareToken(`${TOKEN.slice(0, -1)}B`, digest),
    ).toBe(false);
    expect(matchesCompatibilityShareToken(TOKEN, "sha256:bad")).toBe(false);
    expect(() => digestCompatibilityShareToken("not/canonical")).toThrow(
      "token is invalid",
    );
  });

  it("stores only a digest and applies exact expiry and revocation boundaries", () => {
    const digest = digestCompatibilityShareToken(TOKEN);
    const grant = createCompatibilityShareGrant(digest, EXPIRY);
    expect(grant).toEqual({
      version: COMPATIBILITY_SHARE_TOKEN_VERSION,
      visibility: "public",
      tokenDigest: digest,
      expiresAt: EXPIRY,
      revokedAt: null,
    });
    expect(JSON.stringify(grant)).not.toContain(TOKEN);
    expect(Object.isFrozen(grant)).toBe(true);
    expect(
      evaluateCompatibilityShareAccess(
        TOKEN,
        grant,
        new Date("2029-12-31T23:59:59.999Z"),
      ),
    ).toBe("active");
    expect(
      evaluateCompatibilityShareAccess(TOKEN, grant, new Date(EXPIRY)),
    ).toBe("expired");
    expect(
      evaluateCompatibilityShareAccess(OTHER_TOKEN, grant, new Date(EXPIRY)),
    ).toBe("invalid");

    const revoked = revokeCompatibilityShareGrant(
      grant,
      "2029-06-01T00:00:00.000Z",
    );
    expect(revoked.visibility).toBe("private");
    expect(
      evaluateCompatibilityShareAccess(
        TOKEN,
        revoked,
        new Date("2029-06-01T00:00:00.000Z"),
      ),
    ).toBe("revoked");
    expect(Object.isFrozen(revoked)).toBe(true);
    expect(() =>
      revokeCompatibilityShareGrant(revoked, "2029-06-02T00:00:00.000Z"),
    ).toThrow("grant is invalid");
  });

  it("fails closed for malformed storage state, dates, versions, and clocks", () => {
    const digest = digestCompatibilityShareToken(TOKEN);
    expect(() => createCompatibilityShareGrant("sha256:bad", EXPIRY)).toThrow();
    expect(() => createCompatibilityShareGrant(digest, "2030-01-01")).toThrow();

    const grant = createCompatibilityShareGrant(digest, null);
    const extra = { ...grant, rawToken: TOKEN };
    expect(evaluateCompatibilityShareAccess(TOKEN, extra, new Date())).toBe(
      "invalid",
    );
    expect(
      evaluateCompatibilityShareAccess(
        TOKEN,
        { ...grant, version: "2.0.0" },
        new Date(),
      ),
    ).toBe("invalid");
    expect(
      evaluateCompatibilityShareAccess(TOKEN, grant, new Date("invalid")),
    ).toBe("invalid");
  });
});
