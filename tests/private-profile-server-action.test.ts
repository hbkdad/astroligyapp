import { describe, expect, it, vi } from "vitest";
import type { PrivateProfileCommand } from "@/server/private-profile-contracts";
import type { PrivateProfileMutationResult } from "@/server/authenticated-private-profiles";

const {
  incomingHeaders,
  mutatePrivateProfile,
  serviceProvider,
  revalidatePath,
} = vi.hoisted(() => {
  const incomingHeaders = new Headers({
    cookie: "cosmic-auth.session_token=opaque",
    "x-owner-id": "attacker",
  });
  const mutatePrivateProfile = vi.fn<
    (
      request: Request,
      command: PrivateProfileCommand,
    ) => Promise<PrivateProfileMutationResult>
  >(async () => ({ version: "1.1.0", disposition: "saved" }));
  return {
    incomingHeaders,
    mutatePrivateProfile,
    serviceProvider: vi.fn(() => ({
      canonicalOrigin: "https://app.example.test",
      mutatePrivateProfile,
    })),
    revalidatePath: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => incomingHeaders),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/server/better-auth-http-service", () => ({
  productionBetterAuthHttpService: serviceProvider,
}));

import { mutatePrivateProfileAction } from "@/app/account/profiles/actions";

function form() {
  const data = new FormData();
  const entries: Array<[string, string]> = [
    ["version", "1.1.0"],
    ["operation", "create"],
    ["displayName", "Mira"],
    ["birthName", ""],
    ["currentTimezone", "America/Toronto"],
    ["birthDate", "1990-01-01"],
    ["birthTimePrecision", "date-only"],
    ["birthTimeLocal", ""],
    ["birthTimezone", "America/Toronto"],
    ["latitude", ""],
    ["longitude", ""],
  ];
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("private profile Server Action", () => {
  it("ignores hostile prior state, reauthorizes, and revalidates only after save", async () => {
    await expect(
      mutatePrivateProfileAction({ status: "private-owner" } as never, form()),
    ).resolves.toEqual({ status: "saved" });
    const request = mutatePrivateProfile.mock.calls[0]![0];
    expect([...request.headers.entries()]).toEqual([
      ["cookie", "cosmic-auth.session_token=opaque"],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/account/profiles");
  });

  it("does not construct service or revalidate for hostile fields", async () => {
    serviceProvider.mockClear();
    mutatePrivateProfile.mockClear();
    revalidatePath.mockClear();
    const data = form();
    data.append("entitlement", "multiple_profiles");
    await expect(
      mutatePrivateProfileAction({ status: "idle" }, data),
    ).resolves.toEqual({ status: "authorize" });
    expect(serviceProvider).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
