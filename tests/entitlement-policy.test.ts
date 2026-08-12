import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ENTITLEMENT_POLICY_VERSION,
  INITIAL_ENTITLEMENT_CONFIGURATION,
} from "@/config/entitlement-policy";
import {
  ENTITLEMENT_FEATURE_KEYS,
  SUBSCRIPTION_ENTITLEMENT_STATE_VERSION,
  type EntitlementConfiguration,
  type EntitlementFeatureKey,
  type SubscriptionEntitlementState,
} from "@/domain/entitlements/contracts";
import {
  InvalidEntitlementConfigurationError,
  createEntitlementPolicy,
} from "@/server/entitlement-policy";

const START = "2026-08-01T00:00:00.000Z";
const END = "2026-09-01T00:00:00.000Z";
const PERSONAL_ONLY: EntitlementFeatureKey = "natal_chart";
const ADVANCED_ONLY: EntitlementFeatureKey = "synastry";

function clock(instant = "2026-08-15T12:00:00.000Z") {
  return { now: () => new Date(instant) };
}

function subscription(
  overrides: Partial<SubscriptionEntitlementState> = {},
): SubscriptionEntitlementState {
  return {
    version: SUBSCRIPTION_ENTITLEMENT_STATE_VERSION,
    planKey: "personal",
    status: "active",
    periodStartsAt: START,
    periodEndsAt: END,
    ...overrides,
  };
}

describe("provider-neutral entitlement policy", () => {
  it("defines complete inherited configured tiers without prices or providers", () => {
    const { plans } = INITIAL_ENTITLEMENT_CONFIGURATION;
    expect(INITIAL_ENTITLEMENT_CONFIGURATION.version).toBe(
      ENTITLEMENT_POLICY_VERSION,
    );
    expect(plans.free).toEqual([
      "basic_horoscope",
      "current_moon",
      "basic_zodiac_profile",
      "life_path",
      "basic_numerology",
    ]);
    expect(plans.personal).toEqual(expect.arrayContaining([...plans.free]));
    expect(plans.advanced).toEqual(expect.arrayContaining([...plans.personal]));
    expect(new Set(plans.advanced)).toEqual(new Set(ENTITLEMENT_FEATURE_KEYS));
    expect(JSON.stringify(INITIAL_ENTITLEMENT_CONFIGURATION)).not.toMatch(
      /stripe|price|customer|subscription_reference/i,
    );
    expect(Object.isFrozen(INITIAL_ENTITLEMENT_CONFIGURATION)).toBe(true);
    expect(Object.isFrozen(plans.advanced)).toBe(true);
  });

  it("grants only free capabilities when no subscription exists", () => {
    const policy = createEntitlementPolicy();
    expect(policy.check(null, "current_moon", clock())).toMatchObject({
      allowed: true,
      effectivePlanKey: "free",
      reason: "free-baseline",
      accessEndsAt: null,
    });
    expect(policy.check(null, PERSONAL_ONLY, clock())).toMatchObject({
      allowed: false,
      effectivePlanKey: "free",
      reason: "free-baseline",
    });
    expect(policy.check(null, ADVANCED_ONLY, clock()).allowed).toBe(false);
  });

  it("matches every feature decision to its configured effective tier", () => {
    const policy = createEntitlementPolicy();
    const states = {
      free: null,
      personal: subscription(),
      advanced: subscription({ planKey: "advanced" }),
    } as const;
    for (const [plan, state] of Object.entries(states)) {
      for (const feature of ENTITLEMENT_FEATURE_KEYS) {
        expect(policy.check(state, feature, clock()).allowed).toBe(
          INITIAL_ENTITLEMENT_CONFIGURATION.plans[
            plan as keyof typeof states
          ].includes(feature),
        );
      }
    }
  });

  it.each(["trialing", "active"] as const)(
    "grants configured paid capabilities for %s periods",
    (status) => {
      const policy = createEntitlementPolicy();
      const state = subscription({ planKey: "advanced", status });
      expect(policy.check(state, ADVANCED_ONLY, clock())).toMatchObject({
        allowed: true,
        effectivePlanKey: "advanced",
        reason: "paid-period-active",
        accessEndsAt: END,
      });
      expect(policy.check(state, "current_moon", clock()).allowed).toBe(true);
    },
  );

  it("retains canceled access only until the exact paid-period boundary", () => {
    const policy = createEntitlementPolicy();
    const state = subscription({ planKey: "advanced", status: "canceled" });
    expect(
      policy.check(state, ADVANCED_ONLY, clock("2026-08-31T23:59:59.999Z")),
    ).toMatchObject({
      allowed: true,
      reason: "paid-period-canceled",
      accessEndsAt: END,
    });
    expect(policy.check(state, ADVANCED_ONLY, clock(END))).toMatchObject({
      allowed: false,
      effectivePlanKey: "free",
      reason: "paid-period-expired",
      accessEndsAt: null,
    });
  });

  it("uses a start-inclusive and end-exclusive paid interval", () => {
    const policy = createEntitlementPolicy();
    const state = subscription();
    expect(
      policy.check(state, PERSONAL_ONLY, clock("2026-07-31T23:59:59.999Z")),
    ).toMatchObject({ allowed: false, reason: "paid-period-not-started" });
    expect(policy.check(state, PERSONAL_ONLY, clock(START))).toMatchObject({
      allowed: true,
      reason: "paid-period-active",
    });
    expect(policy.check(state, PERSONAL_ONLY, clock(END))).toMatchObject({
      allowed: false,
      reason: "paid-period-expired",
    });
  });

  it.each(["past_due", "paused"] as const)(
    "fails paid access closed for %s while retaining the free baseline",
    (status) => {
      const policy = createEntitlementPolicy();
      const state = subscription({ planKey: "advanced", status });
      expect(policy.check(state, ADVANCED_ONLY, clock())).toMatchObject({
        allowed: false,
        effectivePlanKey: "free",
        reason: "subscription-inactive",
      });
      expect(policy.check(state, "life_path", clock()).allowed).toBe(true);
    },
  );

  it.each([
    undefined,
    {},
    subscription({ version: "0.9.0" as "1.0.0" }),
    subscription({ planKey: "free" as "personal" }),
    subscription({ status: "unknown" as "active" }),
    subscription({ periodStartsAt: "2026-08-01T00:00:00Z" }),
    subscription({ periodEndsAt: START }),
    { ...subscription(), browserPlan: "advanced" },
  ])("denies malformed or browser-augmented subscription state", (state) => {
    const decision = createEntitlementPolicy().check(
      state,
      "current_moon",
      clock(),
    );
    expect(decision).toMatchObject({
      allowed: false,
      effectivePlanKey: "free",
      reason: "invalid-subscription-state",
    });
  });

  it("denies unknown features and invalid trusted-clock output", () => {
    const policy = createEntitlementPolicy();
    expect(
      policy.check(subscription(), "admin_override", clock()),
    ).toMatchObject({
      feature: null,
      allowed: false,
      reason: "unknown-feature",
    });
    expect(() =>
      policy.check(subscription(), PERSONAL_ONLY, { now: () => new Date(NaN) }),
    ).toThrow("Trusted entitlement clock returned an invalid instant");
  });

  it("rejects policy drift, incomplete coverage, duplicate features, and tier regression", () => {
    const baseline = structuredClone(INITIAL_ENTITLEMENT_CONFIGURATION);
    const invalidConfigurations = [
      { ...baseline, version: "2.0.0" },
      {
        ...baseline,
        plans: {
          free: baseline.plans.free,
          personal: baseline.plans.personal,
        },
      },
      { ...baseline, plans: { ...baseline.plans, advanced: [] } },
      {
        ...baseline,
        plans: {
          ...baseline.plans,
          personal: ["natal_chart"],
        },
      },
      {
        ...baseline,
        plans: {
          ...baseline.plans,
          free: ["current_moon", "current_moon"],
        },
      },
      {
        ...baseline,
        plans: {
          ...baseline.plans,
          free: [...baseline.plans.free, "synastry"],
        },
      },
      {
        ...baseline,
        plans: {
          ...baseline.plans,
          advanced: baseline.plans.advanced.map((feature) =>
            feature === "synastry" ? "unknown_feature" : feature,
          ),
        },
      },
      { ...baseline, extra: true },
    ];
    for (const configuration of invalidConfigurations) {
      expect(() =>
        createEntitlementPolicy(configuration as EntitlementConfiguration),
      ).toThrow(InvalidEntitlementConfigurationError);
    }
  });

  it("returns immutable, reconstructable decisions and snapshots the clock", () => {
    const instant = new Date("2026-08-15T12:00:00.000Z");
    const decision = createEntitlementPolicy().check(
      subscription(),
      PERSONAL_ONLY,
      { now: () => instant },
    );
    instant.setUTCFullYear(2030);
    expect(decision).toEqual({
      policyVersion: ENTITLEMENT_POLICY_VERSION,
      stateVersion: SUBSCRIPTION_ENTITLEMENT_STATE_VERSION,
      feature: PERSONAL_ONLY,
      allowed: true,
      effectivePlanKey: "personal",
      reason: "paid-period-active",
      evaluatedAt: "2026-08-15T12:00:00.000Z",
      accessEndsAt: END,
    });
    expect(Object.isFrozen(decision)).toBe(true);
  });
});
