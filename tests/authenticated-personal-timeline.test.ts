import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPersonalTimelineForRequest } from "@/server/authenticated-personal-timeline";
import { PERSONAL_TIMELINE_CONTRACT_VERSION } from "@/server/personal-timeline-contracts";

const command = {
  version: PERSONAL_TIMELINE_CONTRACT_VERSION,
  profileId: "11111111-1111-4111-8111-111111111111",
  birthProfileId: "22222222-2222-4222-8222-222222222222",
  revision: 1,
};
const session = {
  status: "active",
  subject: "external-subject",
  sessionId: "session-id",
  authenticatedAt: new Date("2026-08-13T12:00:00.000Z"),
  expiresAt: new Date("2026-08-13T13:00:00.000Z"),
} as const;

describe("authenticated personal timeline", () => {
  it("resolves the verified account before passing the opaque command", async () => {
    const load = vi.fn().mockResolvedValue({
      outcome: "ready",
      model: model(),
      scope: "forecast",
      truncated: false,
    });
    const result = await loadPersonalTimelineForRequest(
      new Request("https://example.test/internal/personal-timeline", {
        method: "POST",
      }),
      command,
      {
        sessionVerifier: { verify: vi.fn().mockResolvedValue(session) },
        accountResolver: {
          resolveActiveAccount: vi
            .fn()
            .mockResolvedValue("33333333-3333-4333-8333-333333333333"),
        },
        timelines: { load },
        now: () => new Date("2026-08-13T12:30:00.000Z"),
      },
    );
    expect(result).toMatchObject({ disposition: "ready", scope: "forecast" });
    expect(load).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      command,
    );
  });

  it("fails closed before repository access when the session is absent", async () => {
    const load = vi.fn();
    const result = await loadPersonalTimelineForRequest(
      new Request("https://example.test"),
      command,
      {
        sessionVerifier: {
          verify: vi.fn().mockResolvedValue({ status: "unauthenticated" }),
        },
        accountResolver: { resolveActiveAccount: vi.fn() },
        timelines: { load },
      },
    );
    expect(result.disposition).toBe("authenticate");
    expect(load).not.toHaveBeenCalled();
  });
});

function model() {
  return {
    version: "1.0.0",
    sourceVersion: "1.0.0",
    eyebrow: "Personal event calendar",
    title: "Timeline",
    summary: "Summary",
    intervalLabel: "Interval",
    filters: [],
    items: [],
    trace: [],
  };
}
