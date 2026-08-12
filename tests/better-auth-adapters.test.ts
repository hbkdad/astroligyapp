import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BetterAuthBillingSessionVerifier,
  BetterAuthCurrentPasswordReauthenticator,
  BetterAuthVerifiedSessionVerifier,
} from "@/infrastructure/auth/better-auth-adapters";

const NOW = new Date("2026-08-12T12:00:00.000Z");
const request = new Request("https://app.example.test/private", {
  headers: { cookie: "cosmic-auth.session_token=opaque" },
});

function value(
  sessionOverrides: Record<string, unknown> = {},
  userOverrides: Record<string, unknown> = {},
) {
  return {
    session: {
      id: "session-1",
      userId: "user-1",
      createdAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 60_000),
      ...sessionOverrides,
    },
    user: {
      id: "user-1",
      email: "browser-decoy@example.test",
      emailVerified: true,
      ...userOverrides,
    },
  };
}

describe("Better Auth billing adapters", () => {
  it("maps only a live matching recent database session", async () => {
    const getSession = vi.fn(async (input: { headers: Headers }) => {
      void input;
      return value();
    });
    const verifier = new BetterAuthBillingSessionVerifier(
      { getSession },
      () => NOW,
    );

    await expect(verifier.verify(request)).resolves.toEqual({
      status: "active",
      subject: "user-1",
      sessionId: "session-1",
      authenticatedAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
    expect(getSession.mock.calls[0]?.[0]).not.toHaveProperty("body");
  });

  it.each([
    [null, "unauthenticated"],
    [value({ expiresAt: NOW }), "expired"],
    [value({ createdAt: new Date(NOW.getTime() - 600_001) }), "invalid"],
    [value({ createdAt: new Date(NOW.getTime() + 1) }), "invalid"],
    [value({ userId: "other-user" }), "invalid"],
    [value({ id: "" }), "invalid"],
    [value({ expiresAt: "not-a-date" }), "invalid"],
    [{ session: {}, user: null }, "invalid"],
  ])(
    "fails closed for rejected or malformed session data",
    async (result, status) => {
      const verifier = new BetterAuthBillingSessionVerifier(
        { getSession: async () => result },
        () => NOW,
      );

      await expect(verifier.verify(request)).resolves.toEqual({ status });
    },
  );

  it("propagates provider/database outage without converting it to authentication", async () => {
    const verifier = new BetterAuthBillingSessionVerifier({
      getSession: async () => {
        throw new Error("database unavailable with private detail");
      },
    });

    await expect(verifier.verify(request)).rejects.toThrow(
      "database unavailable",
    );
  });

  it("requires the live Better Auth user to be email verified for account bootstrap", async () => {
    const verified = new BetterAuthVerifiedSessionVerifier(
      { getSession: async () => value() },
      () => NOW,
    );
    await expect(verified.verify(request)).resolves.toMatchObject({
      status: "active",
      subject: "user-1",
    });

    for (const emailVerified of [false, undefined, "true"]) {
      const rejected = new BetterAuthVerifiedSessionVerifier(
        { getSession: async () => value({}, { emailVerified }) },
        () => NOW,
      );
      await expect(rejected.verify(request)).resolves.toEqual({
        status: "invalid",
      });
    }
  });
});

describe("Better Auth current-password reauthentication", () => {
  it("projects only headers and current password into the server API", async () => {
    const verifyPassword = vi.fn(async () => ({ status: true }));
    const reauthenticator = new BetterAuthCurrentPasswordReauthenticator({
      verifyPassword,
    });
    await expect(
      reauthenticator.verify(request, "current-password-123"),
    ).resolves.toBe(true);
    expect(verifyPassword).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { password: "current-password-123" },
    });
    expect(JSON.stringify(verifyPassword.mock.calls)).not.toContain("query");
  });

  it("returns false only for Better Auth's exact invalid-password code", async () => {
    const invalid = new BetterAuthCurrentPasswordReauthenticator({
      verifyPassword: async () => {
        throw {
          body: { code: "INVALID_PASSWORD", message: "private detail" },
        };
      },
    });
    await expect(invalid.verify(request, "wrong-password")).resolves.toBe(
      false,
    );
  });

  it.each([
    async () => ({ status: false }),
    async () => ({ status: true, extra: "unsafe" }),
  ])("rejects malformed server results", async (verifyPassword) => {
    const reauthenticator = new BetterAuthCurrentPasswordReauthenticator({
      verifyPassword,
    });
    if ((await verifyPassword()).status === false) {
      await expect(
        reauthenticator.verify(request, "current-password"),
      ).resolves.toBe(false);
    } else {
      await expect(
        reauthenticator.verify(request, "current-password"),
      ).rejects.toThrow("account is unavailable");
    }
  });

  it("propagates non-password provider failure", async () => {
    const reauthenticator = new BetterAuthCurrentPasswordReauthenticator({
      verifyPassword: async () => {
        throw new Error("private database outage");
      },
    });
    await expect(
      reauthenticator.verify(request, "current-password"),
    ).rejects.toThrow("database outage");
  });
});
