export const CONTEXT_NUMEROLOGY_KEYS = [
  "life-path",
  "expression",
  "soul-urge",
  "personality",
  "birthday",
  "maturity",
  "personal-year",
  "personal-month",
  "personal-day",
] as const;

export type ContextNumerologyKey = (typeof CONTEXT_NUMEROLOGY_KEYS)[number];

export type ContextFactKind =
  | "natal-placement"
  | "natal-aspect"
  | "transit-aspect"
  | "lunar-phase"
  | "personal-lunar-aspect"
  | "numerology";

export interface ContextFactReference {
  readonly id: string;
  readonly kind: ContextFactKind;
}
