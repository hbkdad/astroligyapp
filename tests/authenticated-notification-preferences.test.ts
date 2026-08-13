import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadNotificationPreferencesForRequest,
  replaceNotificationPreferencesForRequest,
} from "@/server/authenticated-notification-preferences";

const selection = {
  version: "1.0.0",
  profileId: "11111111-1111-4111-8111-111111111111",
  birthProfileId: "22222222-2222-4222-8222-222222222222",
  profileRevision: 1,
} as const;
const command = {
  ...selection,
  operation: "replace",
  preferenceRevision: 0,
  channel: "email",
  consent: true,
  eventTypes: ["primary-phase"] as const,
  leadMinutes: 60,
  quietHours: { start: "22:00", end: "07:00" },
} as const;
const owner = "33333333-3333-4333-8333-333333333333";
const session = {
  status: "active",
  subject: "external-subject",
  sessionId: "session-id",
  authenticatedAt: new Date("2026-08-13T12:00:00.000Z"),
  expiresAt: new Date("2026-08-13T13:00:00.000Z"),
} as const;

describe("authenticated notification preferences", () => {
  it("resolves a live account before private preference access", async () => {
    const load = vi.fn().mockResolvedValue(view());
    const result = await loadNotificationPreferencesForRequest(
      new Request(
        "https://example.test/internal/notification-preferences/load",
      ),
      selection,
      dependencies({ load }),
    );
    expect(result).toMatchObject({
      disposition: "ready",
      materialization: null,
    });
    expect(load).toHaveBeenCalledWith(owner, selection);
  });

  it("does not touch persistence without an active session", async () => {
    const load = vi.fn();
    const result = await loadNotificationPreferencesForRequest(
      new Request("https://example.test"),
      selection,
      dependencies(
        { load },
        { verify: vi.fn().mockResolvedValue({ status: "unauthenticated" }) },
      ),
    );
    expect(result.disposition).toBe("authenticate");
    expect(load).not.toHaveBeenCalled();
  });

  it("reports a committed save even when later materialization fails", async () => {
    const saved = view({
      preferenceRevision: 1,
      consent: true,
      eventTypes: ["primary-phase"],
    });
    const replace = vi.fn().mockResolvedValue(saved);
    const materialize = vi.fn().mockRejectedValue(new Error("provider failed"));
    const load = vi.fn();
    const result = await replaceNotificationPreferencesForRequest(
      new Request(
        "https://example.test/internal/notification-preferences/replace",
      ),
      command,
      dependencies({ replace, materialize, load }),
    );
    expect(result).toMatchObject({
      disposition: "ready",
      view: { preferenceRevision: 1, consent: true },
      materialization: {
        status: "calculation-unavailable",
        deliveryProvider: "unavailable",
      },
    });
    expect(load).not.toHaveBeenCalled();
  });
});

function dependencies(
  overrides: Record<string, unknown>,
  sessionVerifier = { verify: vi.fn().mockResolvedValue(session) },
) {
  return {
    sessionVerifier,
    accountResolver: { resolveActiveAccount: vi.fn().mockResolvedValue(owner) },
    preferences: {
      load: vi.fn().mockResolvedValue(view()),
      replace: vi.fn().mockResolvedValue(view()),
      materialize: vi.fn().mockResolvedValue({
        inserted: 0,
        existing: 0,
        invalidated: 0,
        skippedPast: 0,
        providerAvailability: "provider-unavailable",
      }),
      ...overrides,
    },
    now: () => new Date("2026-08-13T12:30:00.000Z"),
  } as never;
}

function view(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.0.0",
    profileId: selection.profileId,
    birthProfileId: selection.birthProfileId,
    profileRevision: 1,
    preferenceRevision: 0,
    displayName: "Mira",
    channel: "email",
    channelAvailability: "provider-unavailable",
    consent: false,
    eventTypes: [],
    leadMinutes: 60,
    quietHours: null,
    timezone: "America/Toronto",
    deliveries: [],
    ...overrides,
  } as never;
}
