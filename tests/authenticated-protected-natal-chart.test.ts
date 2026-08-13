import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ProtectedNatalLockedError } from "@/infrastructure/persistence/protected-natal-chart-repository";
import { generateProtectedNatalChartForRequest } from "@/server/authenticated-protected-natal-chart";
import { PROTECTED_NATAL_CHART_CONTRACT_VERSION } from "@/server/protected-natal-chart-contracts";

const ownerId = "10000000-0000-4000-8000-000000000001";
const command = {
  version: PROTECTED_NATAL_CHART_CONTRACT_VERSION,
  profileId: "20000000-0000-4000-8000-000000000001",
  birthProfileId: "30000000-0000-4000-8000-000000000001",
  revision: 1,
};
const request = new Request("https://example.test/internal/chart");

function dependencies() {
  return {
    sessionVerifier: {
      verify: vi.fn().mockResolvedValue({
        status: "active",
        subject: "external-user",
        sessionId: "session",
        expiresAt: new Date("2026-08-14T00:00:00.000Z"),
        authenticatedAt: new Date("2026-08-13T11:00:00.000Z"),
      }),
    },
    accountResolver: {
      resolveActiveAccount: vi.fn().mockResolvedValue(ownerId),
    },
    charts: {
      list: vi.fn().mockResolvedValue([]),
      generate: vi.fn().mockResolvedValue({ outcome: "generated" }),
    },
    now: () => new Date("2026-08-13T12:00:00.000Z"),
  };
}

describe("authenticated protected natal generation", () => {
  it("authorizes before forwarding the strict command", async () => {
    const deps = dependencies();
    await expect(
      generateProtectedNatalChartForRequest(request, command, deps),
    ).resolves.toEqual({
      version: PROTECTED_NATAL_CHART_CONTRACT_VERSION,
      disposition: "generated",
    });
    expect(deps.charts.generate).toHaveBeenCalledWith(ownerId, command);
  });

  it("rejects browser birth and ownership fields before storage", async () => {
    const deps = dependencies();
    await expect(
      generateProtectedNatalChartForRequest(
        request,
        { ...command, birthDate: "1990-01-01" },
        deps,
      ),
    ).resolves.toMatchObject({ disposition: "authorize" });
    expect(deps.charts.generate).not.toHaveBeenCalled();
  });

  it("projects entitlement failures without internal details", async () => {
    const deps = dependencies();
    deps.charts.generate.mockRejectedValue(
      new ProtectedNatalLockedError("internal"),
    );
    await expect(
      generateProtectedNatalChartForRequest(request, command, deps),
    ).resolves.toEqual({
      version: PROTECTED_NATAL_CHART_CONTRACT_VERSION,
      disposition: "locked",
    });
  });
});
