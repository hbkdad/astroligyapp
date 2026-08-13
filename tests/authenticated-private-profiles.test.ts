import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadPrivateProfilesForRequest,
  mutatePrivateProfileForRequest,
} from "@/server/authenticated-private-profiles";
import {
  PrivateProfileAuthorizationError,
  PrivateProfileConflictError,
  PrivateProfileLimitError,
} from "@/infrastructure/persistence/private-profile-repository";
import type { AccountId } from "@/infrastructure/auth/account";

const OWNER = "11111111-1111-4111-8111-111111111111" as AccountId;
const NOW = new Date("2026-08-13T12:00:00.000Z");
const request = new Request(
  "https://app.example.test/internal/private-profiles",
);
const command = {
  version: "1.0.0",
  operation: "create",
  value: {
    displayName: "Mira",
    currentTimezone: "America/Toronto",
    birthDate: "1990-01-01",
    birthTimePrecision: "date-only",
    birthTimeLocal: null,
    birthTimezone: "America/Toronto",
    latitude: null,
    longitude: null,
  },
};

function fixture(status: "active" | "unauthenticated" | "invalid" = "active") {
  const verify = vi.fn(async () =>
    status === "active"
      ? {
          status: "active" as const,
          subject: "verified-subject",
          sessionId: "recent-session",
          authenticatedAt: NOW,
          expiresAt: new Date("2026-08-13T13:00:00.000Z"),
        }
      : { status },
  );
  const resolveActiveAccount = vi.fn(async () => OWNER);
  const list = vi.fn(async () => ({
    profiles: [],
    multipleProfilesAllowed: false,
  }));
  const mutate = vi.fn(async () => ({ outcome: "saved" as const }));
  return {
    dependencies: {
      sessionVerifier: { verify },
      accountResolver: { resolveActiveAccount },
      profiles: { list, mutate },
      now: () => NOW,
    },
    verify,
    resolveActiveAccount,
    list,
    mutate,
  };
}

describe("authenticated private profile composition", () => {
  it("derives the owner from a live session for reads and writes", async () => {
    const value = fixture();
    await expect(
      loadPrivateProfilesForRequest(request, value.dependencies),
    ).resolves.toEqual({
      version: "1.0.0",
      disposition: "ready",
      profiles: [],
      multipleProfilesAllowed: false,
    });
    await expect(
      mutatePrivateProfileForRequest(request, command, value.dependencies),
    ).resolves.toEqual({ version: "1.0.0", disposition: "saved" });
    expect(value.list).toHaveBeenCalledWith(OWNER);
    expect(value.mutate).toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({ operation: "create" }),
    );
  });

  it.each(["unauthenticated", "invalid"] as const)(
    "fails closed for %s sessions before account or data access",
    async (status) => {
      const value = fixture(status);
      await expect(
        mutatePrivateProfileForRequest(request, command, value.dependencies),
      ).resolves.toEqual({ version: "1.0.0", disposition: "authenticate" });
      expect(value.resolveActiveAccount).not.toHaveBeenCalled();
      expect(value.mutate).not.toHaveBeenCalled();
    },
  );

  it("rejects hostile commands only after authenticating", async () => {
    const value = fixture();
    await expect(
      mutatePrivateProfileForRequest(
        request,
        { ...command, ownerId: "attacker" },
        value.dependencies,
      ),
    ).resolves.toEqual({ version: "1.0.0", disposition: "authorize" });
    expect(value.verify).toHaveBeenCalledOnce();
    expect(value.mutate).not.toHaveBeenCalled();
  });

  it.each([
    [new PrivateProfileAuthorizationError(), "authorize"],
    [new PrivateProfileConflictError(), "conflict"],
    [new PrivateProfileLimitError(), "limit"],
    [new Error("private database"), "retry"],
  ] as const)(
    "maps repository failures without leaking details",
    async (error, disposition) => {
      const value = fixture();
      value.mutate.mockRejectedValueOnce(error);
      const result = await mutatePrivateProfileForRequest(
        request,
        command,
        value.dependencies,
      );
      expect(result).toEqual({ version: "1.0.0", disposition });
      expect(JSON.stringify(result)).not.toContain("private database");
    },
  );
});
