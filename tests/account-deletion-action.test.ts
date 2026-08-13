import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deleteAccountFromForm,
  type AccountDeletionService,
} from "@/server/account-deletion-action";
import type { AuthenticatedAccountDeletionResult } from "@/server/authenticated-account-deletion";

const ORIGIN = "https://app.example.test";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.append("version", overrides.version ?? "1.0.0");
  data.append("confirmation", overrides.confirmation ?? "DELETE MY ACCOUNT");
  data.append(
    "currentPassword",
    overrides.currentPassword ?? "current-password-123",
  );
  return data;
}

function result(
  disposition: AuthenticatedAccountDeletionResult["disposition"],
): AuthenticatedAccountDeletionResult {
  if (disposition === "deleted")
    return { version: "1.0.0", disposition, code: "account-deleted" };
  if (disposition === "authenticate")
    return { version: "1.0.0", disposition, code: "authentication-required" };
  if (disposition === "reject")
    return { version: "1.0.0", disposition, code: "deletion-not-authorized" };
  if (disposition === "reconcile")
    return {
      version: "1.0.0",
      disposition,
      code: "external-account-reconciliation-required",
    };
  return { version: "1.0.0", disposition, code: "deletion-unavailable" };
}

function fixture(
  value: AuthenticatedAccountDeletionResult = result("deleted"),
) {
  const deleteAccount = vi.fn<
    (request: Request) => Promise<AuthenticatedAccountDeletionResult>
  >(async () => value);
  const service: AccountDeletionService = {
    canonicalOrigin: ORIGIN,
    deleteAccount,
  };
  return { service, deleteAccount, getService: vi.fn(() => service) };
}

describe("first-party account deletion action boundary", () => {
  it("constructs one canonical intent and forwards only the bounded cookie", async () => {
    const value = fixture();
    const headers = new Headers({
      cookie: "cosmic-auth.session_token=opaque",
      origin: "https://evil.example",
      authorization: "Bearer attacker",
      "x-account-id": "attacker-account",
    });

    await expect(
      deleteAccountFromForm(headers, form(), value.getService),
    ).resolves.toEqual({ status: "deleted" });
    const request = value.deleteAccount.mock.calls[0]![0];
    expect(request.url).toBe(`${ORIGIN}/internal/account-deletion`);
    expect(request.method).toBe("POST");
    expect([...request.headers.entries()]).toEqual([
      ["content-length", "95"],
      ["content-type", "application/json"],
      ["cookie", "cosmic-auth.session_token=opaque"],
      ["origin", ORIGIN],
      ["sec-fetch-site", "same-origin"],
    ]);
    expect(await request.json()).toEqual({
      version: "1.0.0",
      confirmation: "DELETE MY ACCOUNT",
      currentPassword: "current-password-123",
    });
  });

  it.each([
    ["deleted", "deleted"],
    ["authenticate", "authenticate"],
    ["reject", "authorize"],
    ["retry", "retry"],
    ["reconcile", "reconcile"],
  ] as const)("projects %s as fixed %s state", async (disposition, status) => {
    const value = fixture(result(disposition));
    const projected = await deleteAccountFromForm(
      new Headers(),
      form(),
      value.getService,
    );
    expect(projected).toEqual({ status });
    expect(Object.isFrozen(projected)).toBe(true);
    expect(JSON.stringify(projected)).not.toMatch(
      /account-deleted|password|subject|session|provider|uuid/u,
    );
  });

  it.each([
    ["wrong version", { version: "2.0.0" }],
    ["wrong phrase", { confirmation: "delete my account" }],
    ["short password", { currentPassword: "short" }],
  ])(
    "rejects %s before constructing the service",
    async (_label, overrides) => {
      const value = fixture();
      await expect(
        deleteAccountFromForm(new Headers(), form(overrides), value.getService),
      ).resolves.toEqual({ status: "authorize" });
      expect(value.getService).not.toHaveBeenCalled();
    },
  );

  it("rejects reordered, duplicate, file, and hostile identity fields", async () => {
    const values = [
      (() => {
        const data = new FormData();
        data.append("confirmation", "DELETE MY ACCOUNT");
        data.append("version", "1.0.0");
        data.append("currentPassword", "current-password-123");
        return data;
      })(),
      (() => {
        const data = form();
        data.append("currentPassword", "second-password");
        return data;
      })(),
      (() => {
        const data = form();
        data.set("currentPassword", new Blob(["private"]), "password.txt");
        return data;
      })(),
      (() => {
        const data = form();
        data.append("ownerId", "attacker");
        data.append("redirect", "https://evil.example");
        return data;
      })(),
    ];
    for (const data of values) {
      const value = fixture();
      await expect(
        deleteAccountFromForm(new Headers(), data, value.getService),
      ).resolves.toEqual({ status: "authorize" });
      expect(value.getService).not.toHaveBeenCalled();
    }
  });

  it("collapses malformed results and service failures to retry", async () => {
    const malformed = fixture();
    malformed.deleteAccount.mockResolvedValueOnce({
      ...result("deleted"),
      ownerId: "private-id",
    } as never);
    await expect(
      deleteAccountFromForm(new Headers(), form(), malformed.getService),
    ).resolves.toEqual({ status: "retry" });

    const failed = fixture();
    failed.deleteAccount.mockRejectedValueOnce(new Error("private database"));
    await expect(
      deleteAccountFromForm(new Headers(), form(), failed.getService),
    ).resolves.toEqual({ status: "retry" });
  });

  it("rejects oversized and unsafe cookies before service construction", async () => {
    for (const cookie of [
      "a".repeat(8 * 1024 + 1),
      "session=valid\r\nleak=yes",
    ]) {
      const value = fixture();
      await expect(
        deleteAccountFromForm({ get: () => cookie }, form(), value.getService),
      ).resolves.toEqual({ status: "authorize" });
      expect(value.getService).not.toHaveBeenCalled();
    }
  });
});
