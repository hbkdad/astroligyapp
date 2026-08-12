export const ENTITLEMENT_FEATURE_KEYS = [
  "basic_horoscope",
  "current_moon",
  "basic_zodiac_profile",
  "life_path",
  "basic_numerology",
  "natal_chart",
  "personalized_daily_reading",
  "personal_transits",
  "lunar_to_natal_analysis",
  "numerology_cycles",
  "forecast",
  "alerts",
  "full_transit_calendar",
  "synastry",
  "advanced_reports",
  "annual_forecasting",
  "multiple_profiles",
  "downloadable_reports",
  "advanced_ai_explanations",
] as const;

export type EntitlementFeatureKey = (typeof ENTITLEMENT_FEATURE_KEYS)[number];

export const ENTITLEMENT_PLAN_KEYS = ["free", "personal", "advanced"] as const;
export type EntitlementPlanKey = (typeof ENTITLEMENT_PLAN_KEYS)[number];

export const SUBSCRIPTION_ENTITLEMENT_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
] as const;
export type SubscriptionEntitlementStatus =
  (typeof SUBSCRIPTION_ENTITLEMENT_STATUSES)[number];

export const SUBSCRIPTION_ENTITLEMENT_STATE_VERSION = "1.0.0";

export interface SubscriptionEntitlementState {
  readonly version: typeof SUBSCRIPTION_ENTITLEMENT_STATE_VERSION;
  readonly planKey: Exclude<EntitlementPlanKey, "free">;
  readonly status: SubscriptionEntitlementStatus;
  readonly periodStartsAt: string;
  readonly periodEndsAt: string;
}

export interface EntitlementConfiguration {
  readonly version: string;
  readonly plans: Readonly<
    Record<EntitlementPlanKey, readonly EntitlementFeatureKey[]>
  >;
}

export type EntitlementDecisionReason =
  | "free-baseline"
  | "paid-period-active"
  | "paid-period-canceled"
  | "paid-period-not-started"
  | "paid-period-expired"
  | "subscription-inactive"
  | "invalid-subscription-state"
  | "unknown-feature";

export interface EntitlementDecision {
  readonly policyVersion: string;
  readonly stateVersion: typeof SUBSCRIPTION_ENTITLEMENT_STATE_VERSION;
  readonly feature: EntitlementFeatureKey | null;
  readonly allowed: boolean;
  readonly effectivePlanKey: EntitlementPlanKey;
  readonly reason: EntitlementDecisionReason;
  readonly evaluatedAt: string;
  readonly accessEndsAt: string | null;
}

export interface TrustedEntitlementClock {
  now(): Date;
}

export interface EntitlementPolicy {
  readonly version: string;
  check(
    subscriptionState: unknown,
    feature: unknown,
    clock: TrustedEntitlementClock,
  ): EntitlementDecision;
}
