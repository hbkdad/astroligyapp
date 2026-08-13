import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadNotificationPreferencesFromForm,
  replaceNotificationPreferencesFromForm,
} from "@/server/notification-preference-action";

describe("notification preference action", () => {
  it("forwards only a bounded cookie and the exact opaque selection", async () => {
    const loadNotificationPreferences = vi.fn().mockResolvedValue({
      version: "1.0.0",
      disposition: "ready",
      view: view(),
      materialization: null,
    });
    const result = await loadNotificationPreferencesFromForm(
      new Headers({ cookie: "session=opaque", authorization: "ignored" }),
      selectionForm(),
      () => ({
        canonicalOrigin: "https://example.test",
        loadNotificationPreferences,
        replaceNotificationPreferences: vi.fn(),
      }),
    );
    expect(result.status).toBe("ready");
    const [request, selection] = loadNotificationPreferences.mock.calls[0]!;
    expect(request.method).toBe("POST");
    expect(request.headers.get("cookie")).toBe("session=opaque");
    expect(request.headers.get("authorization")).toBeNull();
    expect(selection).toEqual({
      version: "1.0.0",
      profileId: "11111111-1111-4111-8111-111111111111",
      birthProfileId: "22222222-2222-4222-8222-222222222222",
      profileRevision: 1,
    });
  });

  it("rejects extra fields, duplicate fields, and browser-owned contact", async () => {
    const form = selectionForm();
    form.append("email", "attacker@example.test");
    const service = vi.fn();
    expect(
      (await loadNotificationPreferencesFromForm(new Headers(), form, service))
        .status,
    ).toBe("authorize");
    expect(service).not.toHaveBeenCalled();
  });

  it("accepts the exact replacement contract and rejects malformed JSON", async () => {
    const replaceNotificationPreferences = vi.fn().mockResolvedValue({
      version: "1.0.0",
      disposition: "ready",
      view: view({
        preferenceRevision: 1,
        consent: true,
        eventTypes: ["primary-phase"],
      }),
      materialization: {
        status: "prepared",
        inserted: 1,
        existing: 0,
        invalidated: 0,
        skippedPast: 0,
        deliveryProvider: "unavailable",
      },
    });
    const valid = replacementForm();
    const result = await replaceNotificationPreferencesFromForm(
      new Headers(),
      valid,
      () => ({
        canonicalOrigin: "https://example.test",
        loadNotificationPreferences: vi.fn(),
        replaceNotificationPreferences,
      }),
    );
    expect(result.status).toBe("ready");
    expect(replaceNotificationPreferences.mock.calls[0]![1]).not.toHaveProperty(
      "email",
    );

    const malformed = replacementForm();
    malformed.set("eventTypes", "not-json");
    expect(
      (
        await replaceNotificationPreferencesFromForm(
          new Headers(),
          malformed,
          vi.fn(),
        )
      ).status,
    ).toBe("authorize");
  });

  it("fails closed on malformed ready responses", async () => {
    const result = await loadNotificationPreferencesFromForm(
      new Headers(),
      selectionForm(),
      () => ({
        canonicalOrigin: "https://example.test",
        loadNotificationPreferences: vi.fn().mockResolvedValue({
          version: "1.0.0",
          disposition: "ready",
          view: { ...view(), verifiedEmail: "private@example.test" },
          materialization: null,
        }),
        replaceNotificationPreferences: vi.fn(),
      }),
    );
    expect(result.status).toBe("retry");
  });
});

function selectionForm() {
  const form = new FormData();
  form.append("version", "1.0.0");
  form.append("profileId", "11111111-1111-4111-8111-111111111111");
  form.append("birthProfileId", "22222222-2222-4222-8222-222222222222");
  form.append("profileRevision", "1");
  return form;
}

function replacementForm() {
  const form = new FormData();
  form.append("version", "1.0.0");
  form.append("operation", "replace");
  form.append("profileId", "11111111-1111-4111-8111-111111111111");
  form.append("birthProfileId", "22222222-2222-4222-8222-222222222222");
  form.append("profileRevision", "1");
  form.append("preferenceRevision", "0");
  form.append("channel", "email");
  form.append("consent", "true");
  form.append("eventTypes", '["primary-phase"]');
  form.append("leadMinutes", "60");
  form.append("quietHours", '{"start":"22:00","end":"07:00"}');
  return form;
}

function view(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.0.0",
    profileId: "11111111-1111-4111-8111-111111111111",
    birthProfileId: "22222222-2222-4222-8222-222222222222",
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
  };
}
