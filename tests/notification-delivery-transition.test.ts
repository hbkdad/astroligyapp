import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_MAX_ATTEMPTS,
  transitionNotificationDelivery,
  type NotificationDeliveryState,
} from "@/application/transition-notification-delivery";

const pending: NotificationDeliveryState = {
  status: "pending-provider",
  attemptCount: 0,
  nextAttemptAt: null,
  sentAt: null,
  failedAt: null,
  failureCode: null,
  invalidatedAt: null,
};

describe("notification delivery transition", () => {
  it("keeps candidates inert until a provider is explicitly approved", () => {
    expect(
      transitionNotificationDelivery(pending, {
        type: "delivery-failed",
        at: "2026-08-13T12:00:00.000Z",
        failureCode: "temporary",
      }),
    ).toEqual({ ok: false, error: "invalid-event" });

    expect(
      transitionNotificationDelivery(pending, {
        type: "provider-approved",
        at: "2026-08-13T12:00:00.000Z",
      }),
    ).toMatchObject({
      ok: true,
      value: { status: "queued", nextAttemptAt: "2026-08-13T12:00:00.000Z" },
    });
  });

  it("uses bounded deterministic retries and a terminal failure", () => {
    let state: NotificationDeliveryState = {
      ...pending,
      status: "queued",
      nextAttemptAt: "2026-08-13T12:00:00.000Z",
    };
    const expected = [
      "2026-08-13T12:01:00.000Z",
      "2026-08-13T12:05:00.000Z",
      "2026-08-13T12:30:00.000Z",
    ];
    for (const nextAttemptAt of expected) {
      const result = transitionNotificationDelivery(state, {
        type: "delivery-failed",
        at: "2026-08-13T12:00:00.000Z",
        failureCode: "provider-timeout",
      });
      expect(result).toMatchObject({
        ok: true,
        value: { status: "queued", nextAttemptAt },
      });
      if (result.ok) state = result.value;
    }
    const terminal = transitionNotificationDelivery(state, {
      type: "delivery-failed",
      at: "2026-08-13T12:00:00.000Z",
      failureCode: "provider-timeout",
    });
    expect(terminal).toMatchObject({
      ok: true,
      value: {
        status: "failed",
        attemptCount: NOTIFICATION_MAX_ATTEMPTS,
        failedAt: "2026-08-13T12:00:00.000Z",
        failureCode: "provider-timeout",
      },
    });
  });

  it("invalidates active candidates and rejects terminal replay", () => {
    const stale = transitionNotificationDelivery(pending, {
      type: "facts-stale",
      at: "2026-08-13T12:00:00.000Z",
    });
    expect(stale).toMatchObject({
      ok: true,
      value: { status: "stale", invalidatedAt: "2026-08-13T12:00:00.000Z" },
    });
    if (!stale.ok) throw new Error("fixture failed");
    expect(
      transitionNotificationDelivery(stale.value, {
        type: "consent-withdrawn",
        at: "2026-08-13T12:01:00.000Z",
      }),
    ).toEqual({ ok: false, error: "terminal-state" });
  });
});
