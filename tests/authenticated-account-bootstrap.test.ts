import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AccountId } from "@/infrastructure/auth/account";
import type { SessionVerification } from "@/infrastructure/auth/session";
import { bootstrapAccountForRequest } from "@/server/authenticated-account-bootstrap";

const NOW = new Date("2026-08-12T12:00:00.000Z");
const OWNER = "11111111-1111-4111-8111-111111111111" as AccountId;
const OTHER = "22222222-2222-4222-8222-222222222222" as AccountId;
const request = new Request(
  "https://app.example.test/private/bootstrap?accountId=attacker&redirect=https://evil.example",
  {
    method: "POST",
    headers: {
      cookie: "cosmic-auth.session_token=opaque",
      "x-account-id": OTHER,
    },
    body: JSON.stringify({ ownerId: OTHER, subject: "attacker" }),
  },
);

function active(): SessionVerification {
  return {
    status: "active",
    subject: "verified-better-auth-user",
    sessionId: "verified-database-session",
    authenticatedAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 60_000),
  };
}

function fixture(verification: SessionVerification = active()) {
  const verify = vi.fn(async () => verification);
  const bootstrap = vi.fn(async () => OWNER);
  const resolveActiveAccount = vi.fn(async () => OWNER);
  const verifyReady = vi.fn(async () => true);
  return {
    dependencies: {
      sessionVerifier: { verify },
      bootstrapper: { bootstrap },
      accountResolver: { resolveActiveAccount },
      readinessVerifier: { verify: verifyReady },
      now: () => NOW,
    },
    verify,
    bootstrap,
    resolveActiveAccount,
    verifyReady,
  };
}

describe("authenticated account bootstrap orchestration", () => {
  it("uses only the verified session, confirms one identity, and returns no identity", async () => {
    const value = fixture();
    const result = await bootstrapAccountForRequest(
      request,
      value.dependencies,
    );
    expect(result).toEqual({
      version: "1.0.0",
      disposition: "ready",
      code: "account-ready",
    });
    expect(value.verify).toHaveBeenCalledWith(request);
    expect(value.bootstrap).toHaveBeenCalledWith(active());
    expect(value.resolveActiveAccount).toHaveBeenCalledWith(active());
    expect(value.verifyReady).toHaveBeenCalledWith(OWNER);
    expect(JSON.stringify(result)).not.toMatch(
      /verified-better-auth-user|verified-database-session|11111111|attacker|evil/,
    );
  });

  it.each(["unauthenticated", "expired", "revoked", "invalid"] as const)(
    "collapses %s to one authentication outcome and short-circuits",
    async (status) => {
      const value = fixture({ status });
      await expect(
        bootstrapAccountForRequest(request, value.dependencies),
      ).resolves.toEqual({
        version: "1.0.0",
        disposition: "authenticate",
        code: "authentication-required",
      });
      expect(value.bootstrap).not.toHaveBeenCalled();
      expect(value.resolveActiveAccount).not.toHaveBeenCalled();
      expect(value.verifyReady).not.toHaveBeenCalled();
    },
  );

  it("maps verifier outage to retry without reflecting the exception", async () => {
    const value = fixture();
    value.verify.mockRejectedValueOnce(
      new Error("private user/session database detail"),
    );
    const result = await bootstrapAccountForRequest(
      request,
      value.dependencies,
    );
    expect(result).toMatchObject({
      disposition: "retry",
      code: "authentication-unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(value.bootstrap).not.toHaveBeenCalled();
  });

  it.each([
    ["bootstrap", "bootstrap-unavailable"],
    ["account", "account-unavailable"],
    ["readiness", "identity-boundary-unavailable"],
  ] as const)("maps %s outage to a fixed retry result", async (stage, code) => {
    const value = fixture();
    if (stage === "bootstrap")
      value.bootstrap.mockRejectedValueOnce(new Error("private bootstrap"));
    if (stage === "account")
      value.resolveActiveAccount.mockRejectedValueOnce(
        new Error("private account"),
      );
    if (stage === "readiness")
      value.verifyReady.mockRejectedValueOnce(new Error("private transaction"));
    await expect(
      bootstrapAccountForRequest(request, value.dependencies),
    ).resolves.toMatchObject({ disposition: "retry", code });
  });

  it("rejects malformed dependency identities and mismatched bootstrap resolution", async () => {
    const malformedBootstrap = fixture();
    malformedBootstrap.bootstrap.mockResolvedValueOnce(
      "not-an-id" as AccountId,
    );
    await expect(
      bootstrapAccountForRequest(request, malformedBootstrap.dependencies),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "bootstrap-unavailable",
    });
    expect(malformedBootstrap.resolveActiveAccount).not.toHaveBeenCalled();

    const malformedActive = fixture();
    malformedActive.resolveActiveAccount.mockResolvedValueOnce(
      "not-an-id" as AccountId,
    );
    await expect(
      bootstrapAccountForRequest(request, malformedActive.dependencies),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "account-unavailable",
    });

    const mismatch = fixture();
    mismatch.resolveActiveAccount.mockResolvedValueOnce(OTHER);
    await expect(
      bootstrapAccountForRequest(request, mismatch.dependencies),
    ).resolves.toEqual({
      version: "1.0.0",
      disposition: "reconcile",
      code: "account-identity-mismatch",
    });
    expect(mismatch.verifyReady).not.toHaveBeenCalled();
  });

  it("fails closed when identity-scoped readiness returns false", async () => {
    const value = fixture();
    value.verifyReady.mockResolvedValueOnce(false);
    await expect(
      bootstrapAccountForRequest(request, value.dependencies),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "identity-boundary-unavailable",
    });
  });
});
