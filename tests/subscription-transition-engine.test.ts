import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  SUBSCRIPTION_ENTITLEMENT_STATE_VERSION,
  SUBSCRIPTION_ENTITLEMENT_STATUSES,
  type SubscriptionEntitlementStatus,
} from "@/domain/entitlements/contracts";
import {
  SUBSCRIPTION_TRANSITION_EVENT_VERSION,
  SUBSCRIPTION_TRANSITION_STATE_VERSION,
  type NormalizedSubscriptionEvent,
  type SubscriptionTransitionState,
} from "@/domain/entitlements/subscription-transitions";
import { createEntitlementPolicy } from "@/server/entitlement-policy";
import {
  applySubscriptionEvent,
  digestNormalizedSubscriptionEvent,
  projectSubscriptionEntitlementState,
  validateNormalizedSubscriptionEvent,
} from "@/server/subscription-transition-engine";

const START = "2026-08-01T00:00:00.000Z";
const END = "2026-09-01T00:00:00.000Z";
const EVENT_TIME = "2026-08-01T00:01:00.000Z";

function event(
  overrides: Partial<NormalizedSubscriptionEvent> = {},
): NormalizedSubscriptionEvent {
  return {
    version: SUBSCRIPTION_TRANSITION_EVENT_VERSION,
    eventId: "evt_001",
    occurredAt: EVENT_TIME,
    planKey: "personal",
    status: "active",
    periodStartsAt: START,
    periodEndsAt: END,
    ...overrides,
  };
}

function initialState(
  status: SubscriptionEntitlementStatus = "active",
): SubscriptionTransitionState {
  return applySubscriptionEvent(null, event({ status })).state!;
}

function later(
  status: SubscriptionEntitlementStatus,
  overrides: Partial<NormalizedSubscriptionEvent> = {},
) {
  return event({
    eventId: `evt_${status}_002`,
    occurredAt: "2026-08-02T00:01:00.000Z",
    status,
    ...overrides,
  });
}

describe("provider-neutral subscription transition engine", () => {
  it.each(SUBSCRIPTION_ENTITLEMENT_STATUSES)(
    "accepts %s as a valid initial normalized state",
    (status) => {
      const transition = applySubscriptionEvent(null, event({ status }));
      expect(transition).toMatchObject({
        version: SUBSCRIPTION_TRANSITION_STATE_VERSION,
        outcome: "applied",
        changed: true,
        state: { status, lastEventId: "evt_001" },
      });
      expect(Object.isFrozen(transition)).toBe(true);
      expect(Object.isFrozen(transition.state)).toBe(true);
    },
  );

  it("enforces the complete explicit status transition matrix", () => {
    const allowed: Record<
      SubscriptionEntitlementStatus,
      readonly SubscriptionEntitlementStatus[]
    > = {
      trialing: ["trialing", "active", "past_due", "paused", "canceled"],
      active: ["active", "past_due", "paused", "canceled"],
      past_due: ["past_due", "active", "paused", "canceled"],
      paused: ["paused", "active", "canceled"],
      canceled: ["canceled"],
    };
    for (const from of SUBSCRIPTION_ENTITLEMENT_STATUSES) {
      for (const to of SUBSCRIPTION_ENTITLEMENT_STATUSES) {
        expect(
          applySubscriptionEvent(initialState(from), later(to)).outcome,
        ).toBe(allowed[from].includes(to) ? "applied" : "invalid-transition");
      }
    }
  });

  it("treats exact replay as duplicate and event-ID reuse as conflict", () => {
    const state = initialState();
    expect(applySubscriptionEvent(state, event())).toEqual({
      version: SUBSCRIPTION_TRANSITION_STATE_VERSION,
      outcome: "duplicate",
      changed: false,
      state,
    });
    expect(
      applySubscriptionEvent(state, event({ planKey: "advanced" })),
    ).toMatchObject({ outcome: "conflict", changed: false, state });
  });

  it("ignores stale events and rejects same-instant ambiguity deterministically", () => {
    const state = initialState();
    expect(
      applySubscriptionEvent(
        state,
        event({
          eventId: "evt_stale",
          occurredAt: "2026-07-31T23:59:59.999Z",
        }),
      ),
    ).toMatchObject({ outcome: "stale", changed: false, state });
    expect(
      applySubscriptionEvent(state, event({ eventId: "evt_same_time" })),
    ).toMatchObject({ outcome: "conflict", changed: false, state });
  });

  it("allows renewals and plan changes but rejects granting-period regression", () => {
    const state = initialState();
    const renewal = later("active", {
      planKey: "advanced",
      periodStartsAt: END,
      periodEndsAt: "2026-10-01T00:00:00.000Z",
    });
    expect(applySubscriptionEvent(state, renewal)).toMatchObject({
      outcome: "applied",
      state: {
        planKey: "advanced",
        periodStartsAt: END,
        periodEndsAt: "2026-10-01T00:00:00.000Z",
      },
    });
    expect(
      applySubscriptionEvent(
        state,
        later("active", { periodEndsAt: "2026-08-15T00:00:00.000Z" }),
      ),
    ).toMatchObject({ outcome: "invalid-transition", state });
    expect(
      applySubscriptionEvent(
        state,
        later("active", { periodStartsAt: "2026-07-01T00:00:00.000Z" }),
      ),
    ).toMatchObject({ outcome: "invalid-transition", state });
  });

  it("allows cancellation to shorten access but never extend a terminal state", () => {
    const state = initialState();
    const shortened = applySubscriptionEvent(
      state,
      later("canceled", { periodEndsAt: "2026-08-20T00:00:00.000Z" }),
    );
    expect(shortened).toMatchObject({
      outcome: "applied",
      state: { status: "canceled", periodEndsAt: "2026-08-20T00:00:00.000Z" },
    });
    expect(
      applySubscriptionEvent(
        shortened.state,
        later("canceled", {
          eventId: "evt_canceled_003",
          occurredAt: "2026-08-03T00:01:00.000Z",
          periodEndsAt: END,
        }),
      ),
    ).toMatchObject({ outcome: "invalid-transition", state: shortened.state });
    expect(
      applySubscriptionEvent(
        shortened.state,
        later("active", {
          eventId: "evt_active_003",
          occurredAt: "2026-08-03T00:01:00.000Z",
          periodEndsAt: "2026-10-01T00:00:00.000Z",
        }),
      ),
    ).toMatchObject({ outcome: "invalid-transition", state: shortened.state });
  });

  it.each(["past_due", "paused"] as const)(
    "applies access-reducing %s events even when they shorten the period",
    (status) => {
      const state = initialState();
      const reduced = applySubscriptionEvent(
        state,
        later(status, { periodEndsAt: "2026-08-20T00:00:00.000Z" }),
      );
      expect(reduced).toMatchObject({
        outcome: "applied",
        state: { status, periodEndsAt: "2026-08-20T00:00:00.000Z" },
      });
      expect(
        createEntitlementPolicy().check(
          projectSubscriptionEntitlementState(reduced.state),
          "natal_chart",
          { now: () => new Date("2026-08-15T00:00:00.000Z") },
        ),
      ).toMatchObject({ allowed: false, reason: "subscription-inactive" });
    },
  );

  it.each(["paused", "canceled"] as const)(
    "accepts provider lifetime starts only for access-reducing %s state",
    (status) => {
      const state = initialState();
      const reduced = applySubscriptionEvent(
        state,
        later(status, {
          periodStartsAt: "2026-07-01T00:00:00.000Z",
          periodEndsAt: "2026-08-20T00:00:00.000Z",
        }),
      );
      expect(reduced).toMatchObject({
        outcome: "applied",
        state: {
          status,
          periodStartsAt: "2026-07-01T00:00:00.000Z",
          periodEndsAt: "2026-08-20T00:00:00.000Z",
        },
      });
      expect(
        applySubscriptionEvent(
          state,
          later(status, {
            eventId: `evt_${status}_extended`,
            periodStartsAt: "2026-07-01T00:00:00.000Z",
            periodEndsAt: "2026-10-01T00:00:00.000Z",
          }),
        ),
      ).toMatchObject({ outcome: "invalid-transition", state });
    },
  );

  it.each([
    undefined,
    {},
    event({ version: "0.9.0" as "1.0.0" }),
    event({ eventId: "contains whitespace" }),
    event({ eventId: `e${"x".repeat(200)}` }),
    event({ occurredAt: "2026-08-01T00:01:00Z" }),
    event({ planKey: "free" as "personal" }),
    event({ status: "unknown" as "active" }),
    event({ periodEndsAt: START }),
    { ...event(), priceId: "browser-price" },
  ])("rejects malformed or adapter-unapproved events", (value) => {
    expect(applySubscriptionEvent(initialState(), value)).toMatchObject({
      outcome: "invalid-event",
      changed: false,
      state: initialState(),
    });
  });

  it("fails invalid current state closed before considering an event", () => {
    for (const current of [
      undefined,
      {},
      { ...initialState(), version: "0.9.0" },
      { ...initialState(), browserStatus: "advanced" },
    ]) {
      expect(applySubscriptionEvent(current, event())).toEqual({
        version: SUBSCRIPTION_TRANSITION_STATE_VERSION,
        outcome: "invalid-current-state",
        changed: false,
        state: null,
      });
    }
  });

  it("clones no-change state and returns immutable results", () => {
    const mutableState = structuredClone(initialState());
    const result = applySubscriptionEvent(
      mutableState,
      event({ eventId: "evt_stale", occurredAt: "2026-07-01T00:00:00.000Z" }),
    );
    (mutableState as { planKey: "personal" | "advanced" }).planKey = "advanced";
    expect(result.state?.planKey).toBe("personal");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
  });

  it("projects only strict state into the Goal 45 entitlement policy", () => {
    const state = applySubscriptionEvent(
      null,
      event({ planKey: "advanced", status: "canceled" }),
    ).state!;
    const projection = projectSubscriptionEntitlementState(state);
    expect(projection).toEqual({
      version: SUBSCRIPTION_ENTITLEMENT_STATE_VERSION,
      planKey: "advanced",
      status: "canceled",
      periodStartsAt: START,
      periodEndsAt: END,
    });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(JSON.stringify(projection)).not.toContain("eventId");
    expect(
      createEntitlementPolicy().check(projection, "synastry", {
        now: () => new Date("2026-08-15T00:00:00.000Z"),
      }),
    ).toMatchObject({ allowed: true, reason: "paid-period-canceled" });
    expect(
      projectSubscriptionEntitlementState({ ...state, extra: true }),
    ).toBeNull();
  });

  it("normalizes and domain-digests valid events for durable receipts", () => {
    const value = event();
    const normalized = validateNormalizedSubscriptionEvent(value);
    const digest = digestNormalizedSubscriptionEvent(value);
    expect(normalized).toEqual(value);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(digest).toBe(digestNormalizedSubscriptionEvent({ ...value }));
    expect(digest).not.toBe(
      digestNormalizedSubscriptionEvent({ ...value, status: "paused" }),
    );
    expect(digest).not.toContain(value.eventId);
    expect(
      validateNormalizedSubscriptionEvent({ ...value, extra: true }),
    ).toBeNull();
    expect(
      digestNormalizedSubscriptionEvent({ ...value, extra: true }),
    ).toBeNull();
  });
});
