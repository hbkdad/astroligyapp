import { describe, expect, it, vi } from "vitest";

const { incomingHeaders, deleteAccount, serviceProvider } = vi.hoisted(() => {
  const incomingHeaders = new Headers({
    cookie: "cosmic-auth.session_token=opaque",
    origin: "https://evil.example",
    "x-account-id": "attacker",
  });
  const deleteAccount = vi.fn<(request: Request) => Promise<unknown>>(
    async () => ({
      version: "1.0.0" as const,
      disposition: "deleted" as const,
      code: "account-deleted" as const,
    }),
  );
  return {
    incomingHeaders,
    deleteAccount,
    serviceProvider: vi.fn(() => ({
      canonicalOrigin: "https://app.example.test",
      deleteAccount,
    })),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => incomingHeaders),
}));
vi.mock("@/server/better-auth-http-service", () => ({
  productionBetterAuthHttpService: serviceProvider,
}));

import { deleteAccountAction } from "@/app/account/actions";

function form() {
  const data = new FormData();
  data.append("version", "1.0.0");
  data.append("confirmation", "DELETE MY ACCOUNT");
  data.append("currentPassword", "current-password-123");
  return data;
}

describe("account deletion Server Action", () => {
  it("ignores hostile prior state and reconstructs trusted request metadata", async () => {
    await expect(
      deleteAccountAction({ status: "private-id" } as never, form()),
    ).resolves.toEqual({ status: "deleted" });
    const request = deleteAccount.mock.calls[0]![0];
    expect(request.headers.get("cookie")).toBe(
      "cosmic-auth.session_token=opaque",
    );
    expect(request.headers.get("origin")).toBe("https://app.example.test");
    expect(request.headers.get("sec-fetch-site")).toBe("same-origin");
    expect(request.headers.get("x-account-id")).toBeNull();
  });

  it("rejects browser identity and redirect fields before the service is requested", async () => {
    serviceProvider.mockClear();
    deleteAccount.mockClear();
    const data = form();
    data.append("subject", "attacker");
    data.append("ownerId", "attacker");
    data.append("redirect", "https://evil.example");

    await expect(
      deleteAccountAction({ status: "idle" }, data),
    ).resolves.toEqual({ status: "authorize" });
    expect(serviceProvider).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
