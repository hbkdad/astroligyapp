import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BetterAuthBillingSessionVerifier } from "@/infrastructure/auth/better-auth-adapters";

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
});
