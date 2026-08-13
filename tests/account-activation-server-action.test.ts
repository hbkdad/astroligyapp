import { describe, expect, it, vi } from "vitest";

const { incomingHeaders, activateAccount, serviceProvider } = vi.hoisted(() => {
  const incomingHeaders = new Headers({
    cookie: "cosmic-auth.session_token=opaque",
    "x-account-id": "attacker",
  });
  const activateAccount = vi.fn<(request: Request) => Promise<unknown>>(
    async () => ({
      version: "1.0.0" as const,
      disposition: "ready" as const,
      code: "account-ready" as const,
    }),
  );
  return {
    incomingHeaders,
    activateAccount,
    serviceProvider: vi.fn(() => ({
      canonicalOrigin: "https://app.example.test",
      activateAccount,
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

import { activateAccountAction } from "@/app/account/actions";

describe("account activation Server Action", () => {
  it("ignores hostile prior state and derives the request from framework headers", async () => {
    const formData = new FormData();
    await expect(
      activateAccountAction({ status: "private-id" } as never, formData),
    ).resolves.toEqual({ status: "ready" });
    expect(serviceProvider).toHaveBeenCalledOnce();
    const request = activateAccount.mock.calls[0]![0];
    expect([...request.headers.entries()]).toEqual([
      ["cookie", "cosmic-auth.session_token=opaque"],
    ]);
  });

  it("rejects named client fields before the process service is requested", async () => {
    serviceProvider.mockClear();
    activateAccount.mockClear();
    const formData = new FormData();
    formData.set("accountId", "attacker");
    formData.set("redirect", "https://evil.example");

    await expect(
      activateAccountAction({ status: "idle" }, formData),
    ).resolves.toEqual({ status: "retry" });
    expect(serviceProvider).not.toHaveBeenCalled();
    expect(activateAccount).not.toHaveBeenCalled();
  });
});
