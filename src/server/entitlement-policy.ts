import "server-only";

import {
  ENTITLEMENT_FEATURE_KEYS,
  ENTITLEMENT_PLAN_KEYS,
  SUBSCRIPTION_ENTITLEMENT_STATE_VERSION,
  SUBSCRIPTION_ENTITLEMENT_STATUSES,
  type EntitlementConfiguration,
  type EntitlementDecision,
  type EntitlementFeatureKey,
  type EntitlementPlanKey,
  type EntitlementPolicy,
  type SubscriptionEntitlementState,
  type TrustedEntitlementClock,
} from "@/domain/entitlements/contracts";
import {
  ENTITLEMENT_POLICY_VERSION,
  INITIAL_ENTITLEMENT_CONFIGURATION,
} from "@/config/entitlement-policy";

const featureKeys = new Set<string>(ENTITLEMENT_FEATURE_KEYS);
const subscriptionStatuses = new Set<string>(SUBSCRIPTION_ENTITLEMENT_STATUSES);
const paidPlanKeys = new Set<string>(["personal", "advanced"]);

export class InvalidEntitlementConfigurationError extends Error {
  constructor() {
    super("Entitlement configuration is invalid");
    this.name = "InvalidEntitlementConfigurationError";
  }
}

export function createEntitlementPolicy(
  configuration: EntitlementConfiguration = INITIAL_ENTITLEMENT_CONFIGURATION,
): EntitlementPolicy {
  const plans = validateConfiguration(configuration);
  return Object.freeze({
    version: configuration.version,
    check(
      subscriptionState: unknown,
      feature: unknown,
      clock: TrustedEntitlementClock,
    ): EntitlementDecision {
      const now = trustedNow(clock);
      if (!isFeature(feature))
        return decision({
          feature: null,
          allowed: false,
          plan: "free",
          reason: "unknown-feature",
          now,
          endsAt: null,
          policyVersion: configuration.version,
        });

      const subscription = validateSubscriptionState(subscriptionState);
      if (subscriptionState !== null && subscription === null)
        return decision({
          feature,
          allowed: false,
          plan: "free",
          reason: "invalid-subscription-state",
          now,
          endsAt: null,
          policyVersion: configuration.version,
        });
      if (subscription === null)
        return decision({
          feature,
          allowed: plans.free.has(feature),
          plan: "free",
          reason: "free-baseline",
          now,
          endsAt: null,
          policyVersion: configuration.version,
        });

      const startsAt = Date.parse(subscription.periodStartsAt);
      const endsAt = Date.parse(subscription.periodEndsAt);
      if (now.getTime() < startsAt)
        return fallback(
          feature,
          "paid-period-not-started",
          now,
          configuration.version,
          plans,
        );
      if (now.getTime() >= endsAt)
        return fallback(
          feature,
          "paid-period-expired",
          now,
          configuration.version,
          plans,
        );
      if (
        subscription.status === "past_due" ||
        subscription.status === "paused"
      )
        return fallback(
          feature,
          "subscription-inactive",
          now,
          configuration.version,
          plans,
        );

      const plan = subscription.planKey;
      return decision({
        feature,
        allowed: plans[plan].has(feature),
        plan,
        reason:
          subscription.status === "canceled"
            ? "paid-period-canceled"
            : "paid-period-active",
        now,
        endsAt: subscription.periodEndsAt,
        policyVersion: configuration.version,
      });
    },
  });
}

function validateConfiguration(configuration: EntitlementConfiguration) {
  try {
    if (
      !record(configuration) ||
      configuration.version !== ENTITLEMENT_POLICY_VERSION
    )
      throw new Error();
    if (
      !exactKeys(configuration, ["version", "plans"]) ||
      !record(configuration.plans)
    )
      throw new Error();
    if (!exactKeys(configuration.plans, ENTITLEMENT_PLAN_KEYS))
      throw new Error();
    const plans = Object.fromEntries(
      ENTITLEMENT_PLAN_KEYS.map((plan) => {
        const features = configuration.plans[plan];
        if (
          !Array.isArray(features) ||
          new Set(features).size !== features.length
        )
          throw new Error();
        if (features.some((feature) => !isFeature(feature))) throw new Error();
        const expected = INITIAL_ENTITLEMENT_CONFIGURATION.plans[plan];
        if (
          features.length !== expected.length ||
          features.some((feature, index) => feature !== expected[index])
        )
          throw new Error();
        return [plan, new Set<EntitlementFeatureKey>(features)];
      }),
    ) as Record<EntitlementPlanKey, Set<EntitlementFeatureKey>>;
    return plans;
  } catch {
    throw new InvalidEntitlementConfigurationError();
  }
}

function validateSubscriptionState(
  value: unknown,
): SubscriptionEntitlementState | null {
  if (value === null) return null;
  if (
    !record(value) ||
    !exactKeys(value, [
      "version",
      "planKey",
      "status",
      "periodStartsAt",
      "periodEndsAt",
    ]) ||
    value.version !== SUBSCRIPTION_ENTITLEMENT_STATE_VERSION ||
    typeof value.planKey !== "string" ||
    !paidPlanKeys.has(value.planKey) ||
    typeof value.status !== "string" ||
    !subscriptionStatuses.has(value.status) ||
    !canonicalInstant(value.periodStartsAt) ||
    !canonicalInstant(value.periodEndsAt) ||
    Date.parse(value.periodStartsAt) >= Date.parse(value.periodEndsAt)
  )
    return null;
  return value as unknown as SubscriptionEntitlementState;
}

function fallback(
  feature: EntitlementFeatureKey,
  reason:
    "paid-period-not-started" | "paid-period-expired" | "subscription-inactive",
  now: Date,
  policyVersion: string,
  plans: Record<EntitlementPlanKey, Set<EntitlementFeatureKey>>,
) {
  return decision({
    feature,
    allowed: plans.free.has(feature),
    plan: "free",
    reason,
    now,
    endsAt: null,
    policyVersion,
  });
}

function decision(
  input: Readonly<{
    feature: EntitlementFeatureKey | null;
    allowed: boolean;
    plan: EntitlementPlanKey;
    reason: EntitlementDecision["reason"];
    now: Date;
    endsAt: string | null;
    policyVersion: string;
  }>,
): EntitlementDecision {
  return Object.freeze({
    policyVersion: input.policyVersion,
    stateVersion: SUBSCRIPTION_ENTITLEMENT_STATE_VERSION,
    feature: input.feature,
    allowed: input.allowed,
    effectivePlanKey: input.plan,
    reason: input.reason,
    evaluatedAt: input.now.toISOString(),
    accessEndsAt: input.endsAt,
  });
}

function trustedNow(clock: TrustedEntitlementClock): Date {
  const now = clock?.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new TypeError(
      "Trusted entitlement clock returned an invalid instant",
    );
  return new Date(now.getTime());
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function isFeature(value: unknown): value is EntitlementFeatureKey {
  return typeof value === "string" && featureKeys.has(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}
