import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type {
  AccountId,
  LocalAccountDeletionOutcome,
} from "@/infrastructure/auth/account";
import type { SessionVerification } from "@/infrastructure/auth/session";
import { deleteAccountForRequest } from "@/server/authenticated-account-deletion";

const ORIGIN = "https://app.example.test";
const NOW = new Date("2026-08-12T12:00:00.000Z");
const OWNER = "11111111-1111-4111-8111-111111111111" as AccountId;
const PASSWORD = "current-password-123";

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: "1.0.0",
    confirmation: "DELETE MY ACCOUNT",
    currentPassword: PASSWORD,
    ...overrides,
  });
}

function request(
  options: {
    url?: string;
    method?: string;
    origin?: string;
    site?: string;
    contentType?: string;
    raw?: string;
    declaredLength?: number;
  } = {},
) {
  const raw = options.raw ?? body();
  return new Request(options.url ?? `${ORIGIN}/internal/account-deletion`, {
    method: options.method ?? "POST",
    headers: {
      origin: options.origin ?? ORIGIN,
      "sec-fetch-site": options.site ?? "same-origin",
      "content-type": options.contentType ?? "application/json",
      "content-length": String(
        options.declaredLength ?? Buffer.byteLength(raw, "utf8"),
      ),
      cookie: "cosmic-auth.session_token=opaque",
      "x-account-id": "attacker-account",
    },
    body: raw,
  });
}

function active(): SessionVerification {
  return {
    status: "active",
    subject: "verified-better-auth-user",
    sessionId: "recent-database-session",
    authenticatedAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 60_000),
  };
}

function fixture(verification: SessionVerification = active()) {
  const verifySession = vi.fn(async () => verification);
  const resolveActiveAccount = vi.fn(async () => OWNER);
  const verifyPassword = vi.fn(async () => true);
  const erase = vi.fn(
    async (): Promise<LocalAccountDeletionOutcome> => "deleted",
  );
  return {
    dependencies: {
      canonicalOrigin: ORIGIN,
      sessionVerifier: { verify: verifySession },
      accountResolver: { resolveActiveAccount },
      passwordReauthenticator: { verify: verifyPassword },
      eraser: { erase },
      now: () => NOW,
    },
    verifySession,
    resolveActiveAccount,
    verifyPassword,
    erase,
  };
}

describe("authenticated account deletion", () => {
  it("deletes only after verified identity, same-origin intent, and password reauthentication", async () => {
    const value = fixture();
    const input = request();
    const result = await deleteAccountForRequest(input, value.dependencies);
    expect(result).toEqual({
      version: "1.0.0",
      disposition: "deleted",
      code: "account-deleted",
    });
    expect(value.resolveActiveAccount).toHaveBeenCalledWith(active());
    expect(value.verifyPassword).toHaveBeenCalledWith(input, PASSWORD);
    expect(value.erase).toHaveBeenCalledWith(active(), OWNER);
    expect(JSON.stringify(result)).not.toMatch(
      /verified-better-auth-user|recent-database-session|11111111|password/,
    );
  });

  it.each(["unauthenticated", "expired", "revoked", "invalid"] as const)(
    "collapses %s before reading destructive intent",
    async (status) => {
      const value = fixture({ status });
      await expect(
        deleteAccountForRequest(request(), value.dependencies),
      ).resolves.toEqual({
        version: "1.0.0",
        disposition: "authenticate",
        code: "authentication-required",
      });
      expect(value.resolveActiveAccount).not.toHaveBeenCalled();
      expect(value.verifyPassword).not.toHaveBeenCalled();
      expect(value.erase).not.toHaveBeenCalled();
    },
  );

  it.each([
    { url: `${ORIGIN}/internal/account-deletion?owner=attacker` },
    { url: "https://evil.example/internal/account-deletion" },
    { method: "PUT" },
    { origin: "https://evil.example" },
    { site: "cross-site" },
    { contentType: "application/json; charset=utf-8" },
    { declaredLength: 1 },
    { raw: `${body()} ` },
    { raw: body({ confirmation: "delete" }) },
    { raw: body({ version: "2.0.0" }) },
    { raw: body({ ownerId: OWNER }) },
    {
      raw: `{"version":"1.0.0","version":"1.0.0","confirmation":"DELETE MY ACCOUNT","currentPassword":"${PASSWORD}"}`,
    },
  ])(
    "rejects malformed or cross-origin intent without resolving an account",
    async (options) => {
      const value = fixture();
      await expect(
        deleteAccountForRequest(request(options), value.dependencies),
      ).resolves.toEqual({
        version: "1.0.0",
        disposition: "reject",
        code: "deletion-not-authorized",
      });
      expect(value.resolveActiveAccount).not.toHaveBeenCalled();
      expect(value.verifyPassword).not.toHaveBeenCalled();
      expect(value.erase).not.toHaveBeenCalled();
    },
  );

  it("rejects incorrect password with the same authorization result", async () => {
    const value = fixture();
    value.verifyPassword.mockResolvedValueOnce(false);
    await expect(
      deleteAccountForRequest(request(), value.dependencies),
    ).resolves.toMatchObject({
      disposition: "reject",
      code: "deletion-not-authorized",
    });
    expect(value.erase).not.toHaveBeenCalled();
  });

  it.each([
    ["session", "authentication-unavailable"],
    ["account", "account-unavailable"],
    ["password", "reauthentication-unavailable"],
    ["erase", "deletion-unavailable"],
  ] as const)("maps %s outage to a fixed retry result", async (stage, code) => {
    const value = fixture();
    if (stage === "session")
      value.verifySession.mockRejectedValueOnce(new Error("private session"));
    if (stage === "account")
      value.resolveActiveAccount.mockRejectedValueOnce(
        new Error("private account"),
      );
    if (stage === "password")
      value.verifyPassword.mockRejectedValueOnce(new Error("private password"));
    if (stage === "erase")
      value.erase.mockRejectedValueOnce(new Error("private deletion"));
    const result = await deleteAccountForRequest(request(), value.dependencies);
    expect(result).toMatchObject({ disposition: "retry", code });
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("requires a canonical resolved account and maps retained billing to reconciliation", async () => {
    const malformed = fixture();
    malformed.resolveActiveAccount.mockResolvedValueOnce(
      "browser-account" as AccountId,
    );
    await expect(
      deleteAccountForRequest(request(), malformed.dependencies),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "account-unavailable",
    });
    expect(malformed.verifyPassword).not.toHaveBeenCalled();

    const retained = fixture();
    retained.erase.mockResolvedValueOnce("reconciliation-required");
    await expect(
      deleteAccountForRequest(request(), retained.dependencies),
    ).resolves.toEqual({
      version: "1.0.0",
      disposition: "reconcile",
      code: "external-account-reconciliation-required",
    });
  });

  it("fails closed for an unavailable or malformed erasure result", async () => {
    const unavailable = fixture();
    unavailable.erase.mockResolvedValueOnce("unavailable");
    await expect(
      deleteAccountForRequest(request(), unavailable.dependencies),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "deletion-unavailable",
    });

    const malformed = fixture();
    malformed.erase.mockResolvedValueOnce("other" as never);
    await expect(
      deleteAccountForRequest(request(), malformed.dependencies),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "deletion-unavailable",
    });
  });
});
