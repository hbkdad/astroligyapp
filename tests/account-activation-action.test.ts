import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  activateAccountFromHeaders,
  type AccountActivationService,
} from "@/server/account-activation-action";
import type { AuthenticatedAccountBootstrapResult } from "@/server/authenticated-account-bootstrap";

const ORIGIN = "https://app.example.test";

function result(
  disposition: AuthenticatedAccountBootstrapResult["disposition"],
): AuthenticatedAccountBootstrapResult {
  if (disposition === "ready")
    return { version: "1.0.0", disposition, code: "account-ready" };
  if (disposition === "authenticate")
    return { version: "1.0.0", disposition, code: "authentication-required" };
  if (disposition === "reconcile")
    return { version: "1.0.0", disposition, code: "account-identity-mismatch" };
  return { version: "1.0.0", disposition, code: "bootstrap-unavailable" };
}

function fixture(value: AuthenticatedAccountBootstrapResult = result("ready")) {
  const activateAccount = vi.fn<
    (request: Request) => Promise<AuthenticatedAccountBootstrapResult>
  >(async () => value);
  const service: AccountActivationService = {
    canonicalOrigin: ORIGIN,
    activateAccount,
  };
  return { service, activateAccount, getService: vi.fn(() => service) };
}

describe("first-party account activation action boundary", () => {
  it("forwards only the bounded cookie into one fixed internal request", async () => {
    const value = fixture();
    const headers = new Headers({
      cookie: "cosmic-auth.session_token=opaque",
      origin: "https://evil.example",
      "x-account-id": "attacker-account",
      authorization: "Bearer attacker",
    });

    await expect(
      activateAccountFromHeaders(headers, false, value.getService),
    ).resolves.toEqual({ status: "ready" });
    expect(value.activateAccount).toHaveBeenCalledOnce();
    const request = value.activateAccount.mock.calls[0]![0];
    expect(request.url).toBe(`${ORIGIN}/internal/account-bootstrap`);
    expect(request.method).toBe("POST");
    expect([...request.headers.entries()]).toEqual([
      ["cookie", "cosmic-auth.session_token=opaque"],
    ]);
    expect(await request.text()).toBe("");
  });

  it("rejects every named client field before service construction", async () => {
    const value = fixture();
    await expect(
      activateAccountFromHeaders(new Headers(), true, value.getService),
    ).resolves.toEqual({ status: "retry" });
    expect(value.getService).not.toHaveBeenCalled();
    expect(value.activateAccount).not.toHaveBeenCalled();
  });

  it.each(["ready", "authenticate", "retry", "reconcile"] as const)(
    "projects the fixed %s disposition without version, code, or identity",
    async (disposition) => {
      const value = fixture(result(disposition));
      const projected = await activateAccountFromHeaders(
        new Headers(),
        false,
        value.getService,
      );
      expect(projected).toEqual({ status: disposition });
      expect(Object.isFrozen(projected)).toBe(true);
      expect(JSON.stringify(projected)).not.toMatch(
        /account-ready|bootstrap-unavailable|identity|session|subject|uuid/u,
      );
    },
  );

  it("collapses malformed service results, unsafe origins, and dependency errors", async () => {
    const malformed = fixture();
    malformed.activateAccount.mockResolvedValueOnce({
      ...result("ready"),
      accountId: "private-id",
    } as never);
    await expect(
      activateAccountFromHeaders(new Headers(), false, malformed.getService),
    ).resolves.toEqual({ status: "retry" });

    const unsafe = fixture();
    const unsafeService = {
      ...unsafe.service,
      canonicalOrigin: "https://app.example.test/path",
    };
    await expect(
      activateAccountFromHeaders(new Headers(), false, () => unsafeService),
    ).resolves.toEqual({ status: "retry" });
    expect(unsafe.activateAccount).not.toHaveBeenCalled();

    const failed = fixture();
    failed.activateAccount.mockRejectedValueOnce(new Error("private database"));
    await expect(
      activateAccountFromHeaders(new Headers(), false, failed.getService),
    ).resolves.toEqual({ status: "retry" });
  });

  it("rejects oversized or unsafe cookie headers without constructing dependencies", async () => {
    for (const cookie of [
      "a".repeat(8 * 1024 + 1),
      "session=valid\r\nleak=yes",
    ]) {
      const value = fixture();
      const headers = { get: () => cookie };
      await expect(
        activateAccountFromHeaders(headers, false, value.getService),
      ).resolves.toEqual({ status: "retry" });
      expect(value.getService).not.toHaveBeenCalled();
    }
  });
});
