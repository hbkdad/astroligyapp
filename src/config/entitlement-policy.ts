import type { EntitlementConfiguration } from "@/domain/entitlements/contracts";

export const ENTITLEMENT_POLICY_VERSION = "1.0.0";

const FREE_FEATURES = [
  "basic_horoscope",
  "current_moon",
  "basic_zodiac_profile",
  "life_path",
  "basic_numerology",
] as const;

const PERSONAL_FEATURES = [
  ...FREE_FEATURES,
  "natal_chart",
  "personalized_daily_reading",
  "personal_transits",
  "lunar_to_natal_analysis",
  "numerology_cycles",
  "forecast",
  "alerts",
] as const;

export const INITIAL_ENTITLEMENT_CONFIGURATION: EntitlementConfiguration =
  deepFreeze({
    version: ENTITLEMENT_POLICY_VERSION,
    plans: {
      free: FREE_FEATURES,
      personal: PERSONAL_FEATURES,
      advanced: [
        ...PERSONAL_FEATURES,
        "full_transit_calendar",
        "synastry",
        "advanced_reports",
        "annual_forecasting",
        "multiple_profiles",
        "downloadable_reports",
        "advanced_ai_explanations",
      ],
    },
  });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
