import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PersonalTodayLockedError } from "@/infrastructure/persistence/personal-today-repository";
import { getDemoDashboard } from "@/presentation/dashboard-demo";
import { loadPersonalTodayForRequest } from "@/server/authenticated-personal-today";

const ownerId = "10000000-0000-4000-8000-000000000001";
const command = {
  version: "1.0.0" as const,
  profileId: "20000000-0000-4000-8000-000000000001",
  birthProfileId: "30000000-0000-4000-8000-000000000001",
  revision: 1,
};

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
    today: { load: vi.fn() },
    now: () => new Date("2026-08-13T12:00:00.000Z"),
  };
}

describe("authenticated personal Today", () => {
  it("authorizes before loading and returns only the presentation model", async () => {
    const deps = dependencies();
    const model = await getDemoDashboard();
    deps.today.load.mockResolvedValue({ outcome: "ready", model });
    await expect(
      loadPersonalTodayForRequest(
        new Request("https://example.test/internal/today"),
        command,
        deps,
      ),
    ).resolves.toEqual({ version: "1.0.0", disposition: "ready", model });
    expect(deps.today.load).toHaveBeenCalledWith(ownerId, command);
  });

  it("rejects over-posted private facts before repository access", async () => {
    const deps = dependencies();
    await expect(
      loadPersonalTodayForRequest(
        new Request("https://example.test/internal/today"),
        { ...command, birthName: "Mira" },
        deps,
      ),
    ).resolves.toMatchObject({ disposition: "authorize" });
    expect(deps.today.load).not.toHaveBeenCalled();
  });

  it("projects entitlement and incomplete states without internal reasons", async () => {
    const deps = dependencies();
    deps.today.load.mockRejectedValue(new PersonalTodayLockedError("secret"));
    await expect(
      loadPersonalTodayForRequest(
        new Request("https://example.test"),
        command,
        deps,
      ),
    ).resolves.toEqual({ version: "1.0.0", disposition: "locked" });
    deps.today.load.mockResolvedValue({
      outcome: "incomplete",
      reason: "birth-name",
    });
    await expect(
      loadPersonalTodayForRequest(
        new Request("https://example.test"),
        command,
        deps,
      ),
    ).resolves.toEqual({ version: "1.0.0", disposition: "incomplete" });
  });
});
