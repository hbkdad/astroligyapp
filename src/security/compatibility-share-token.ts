import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const COMPATIBILITY_SHARE_TOKEN_VERSION = "1.0.0";
export const COMPATIBILITY_SHARE_TOKEN_ENTROPY_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TOKEN_DIGEST_DOMAIN = "personal-cosmic-calendar:compatibility-share:v1:";

export interface CompatibilityShareGrant {
  readonly version: string;
  readonly visibility: "public" | "private";
  readonly tokenDigest: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

export type CompatibilityShareAccessDecision =
  "active" | "invalid" | "expired" | "revoked";

export function generateCompatibilityShareToken(): string {
  return randomBytes(COMPATIBILITY_SHARE_TOKEN_ENTROPY_BYTES).toString(
    "base64url",
  );
}

export function digestCompatibilityShareToken(token: string): string {
  if (!validToken(token)) throw new InvalidShareTokenError();
  return `sha256:${createHash("sha256")
    .update(TOKEN_DIGEST_DOMAIN, "utf8")
    .update(token, "ascii")
    .digest("hex")}`;
}

export function matchesCompatibilityShareToken(
  token: string,
  expectedDigest: string,
): boolean {
  try {
    const actual = Buffer.from(digestCompatibilityShareToken(token), "ascii");
    const expected = Buffer.from(expectedDigest, "ascii");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export function createCompatibilityShareGrant(
  tokenDigest: string,
  expiresAt: string | null,
): CompatibilityShareGrant {
  validateDigest(tokenDigest);
  if (expiresAt !== null) validateInstant(expiresAt);
  return deepFreeze({
    version: COMPATIBILITY_SHARE_TOKEN_VERSION,
    visibility: "public" as const,
    tokenDigest,
    expiresAt,
    revokedAt: null,
  });
}

export function revokeCompatibilityShareGrant(
  grant: CompatibilityShareGrant,
  revokedAt: string,
): CompatibilityShareGrant {
  validateGrant(grant);
  validateInstant(revokedAt);
  if (grant.revokedAt !== null) throw new InvalidShareGrantError();
  return deepFreeze({ ...grant, visibility: "private" as const, revokedAt });
}

export function evaluateCompatibilityShareAccess(
  token: string,
  grant: CompatibilityShareGrant,
  now: Date,
): CompatibilityShareAccessDecision {
  try {
    validateGrant(grant);
    if (!Number.isFinite(now.getTime())) throw new InvalidShareGrantError();
    if (!matchesCompatibilityShareToken(token, grant.tokenDigest))
      return "invalid";
    if (grant.visibility === "private" || grant.revokedAt !== null)
      return "revoked";
    if (
      grant.expiresAt !== null &&
      now.getTime() >= new Date(grant.expiresAt).getTime()
    )
      return "expired";
    return "active";
  } catch {
    return "invalid";
  }
}

export class InvalidShareTokenError extends Error {
  constructor() {
    super("Compatibility share token is invalid");
    this.name = "InvalidShareTokenError";
  }
}

export class InvalidShareGrantError extends Error {
  constructor() {
    super("Compatibility share grant is invalid");
    this.name = "InvalidShareGrantError";
  }
}

function validateGrant(grant: CompatibilityShareGrant): void {
  if (
    !grant ||
    typeof grant !== "object" ||
    !sameKeys(grant, [
      "version",
      "visibility",
      "tokenDigest",
      "expiresAt",
      "revokedAt",
    ]) ||
    grant.version !== COMPATIBILITY_SHARE_TOKEN_VERSION ||
    (grant.visibility !== "public" && grant.visibility !== "private") ||
    (grant.visibility === "public" && grant.revokedAt !== null) ||
    (grant.visibility === "private" && grant.revokedAt === null)
  )
    throw new InvalidShareGrantError();
  validateDigest(grant.tokenDigest);
  if (grant.expiresAt !== null) validateInstant(grant.expiresAt);
  if (grant.revokedAt !== null) validateInstant(grant.revokedAt);
}

function validateDigest(digest: string): void {
  if (!DIGEST_PATTERN.test(digest)) throw new InvalidShareGrantError();
}

function validToken(token: string): boolean {
  return (
    TOKEN_PATTERN.test(token) &&
    Buffer.from(token, "base64url").toString("base64url") === token
  );
}

function validateInstant(value: string): void {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    throw new InvalidShareGrantError();
}

function sameKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
