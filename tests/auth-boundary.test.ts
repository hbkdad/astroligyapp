import { describe, expect, it } from "vitest";

import {
  AuthenticationRequiredError,
  requireActiveSession,
  type SessionVerification,
  type SessionVerifier,
} from "@/infrastructure/auth/session";

const now = new Date("2026-08-09T12:00:00.000Z");
const request = new Request("https://example.test/private");

function verifier(result: SessionVerification): SessionVerifier {
  return { verify: async () => result };
}

describe("provider-neutral session boundary", () => {
  it("accepts a fully verified active server session", async () => {
    const session = await requireActiveSession(
      verifier({
        status: "active",
        subject: "provider|opaque-subject",
        sessionId: "opaque-session",
        authenticatedAt: new Date("2026-08-09T11:00:00.000Z"),
        expiresAt: new Date("2026-08-09T13:00:00.000Z"),
      }),
      request,
      () => now,
    );

    expect(session.status).toBe("active");
  });

  it.each(["unauthenticated", "expired", "revoked", "invalid"] as const)(
    "rejects %s sessions with the same non-enumerating error",
    async (status) => {
      await expect(
        requireActiveSession(verifier({ status }), request, () => now),
      ).rejects.toEqual(new AuthenticationRequiredError());
    },
  );

  it("rejects stale, future-issued, and incomplete active claims", async () => {
    const invalidSessions: SessionVerification[] = [
      {
        status: "active",
        subject: "subject",
        sessionId: "session",
        authenticatedAt: new Date("2026-08-09T11:00:00.000Z"),
        expiresAt: now,
      },
      {
        status: "active",
        subject: "subject",
        sessionId: "session",
        authenticatedAt: new Date("2026-08-09T12:01:00.000Z"),
        expiresAt: new Date("2026-08-09T13:00:00.000Z"),
      },
      {
        status: "active",
        subject: " ",
        sessionId: "session",
        authenticatedAt: new Date("2026-08-09T11:00:00.000Z"),
        expiresAt: new Date("2026-08-09T13:00:00.000Z"),
      },
      {
        status: "active",
        subject: "subject",
        sessionId: "session",
        authenticatedAt: new Date(Number.NaN),
        expiresAt: new Date("2026-08-09T13:00:00.000Z"),
      },
      {
        status: "active",
        subject: "x".repeat(513),
        sessionId: "session",
        authenticatedAt: new Date("2026-08-09T11:00:00.000Z"),
        expiresAt: new Date("2026-08-09T13:00:00.000Z"),
      },
    ];

    for (const session of invalidSessions) {
      await expect(
        requireActiveSession(verifier(session), request, () => now),
      ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    }
  });
});
