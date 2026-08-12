import type { AspectPhase, AspectType } from "@/domain/astro/aspects";
import type { CelestialBody } from "@/domain/astro/contracts";
import type { SynastryChartSide } from "@/application/calculate-synastry-aspects";

export const COMPATIBILITY_PHASE_ONE_FACT_KEYS = [
  "zodiac.signs",
  "zodiac.elements",
  "zodiac.modalities",
  "numerology.lifePath",
  "numerology.expression",
] as const;

export type CompatibilityPhaseOneFactKey =
  (typeof COMPATIBILITY_PHASE_ONE_FACT_KEYS)[number];

export interface CompatibilityPhaseOneSelector {
  readonly kind: "phase-one-pair";
  readonly fact: CompatibilityPhaseOneFactKey;
  readonly equal?: boolean;
  readonly values?: readonly [string | number, string | number];
  readonly masterNumberCount?: 0 | 1 | 2;
}

export interface CompatibilitySynastrySelector {
  readonly kind: "synastry-aspect";
  readonly firstBody?: CelestialBody;
  readonly secondBody?: CelestialBody;
  readonly aspectType?: AspectType;
  readonly phase?: AspectPhase;
  readonly minimumStrength?: number;
}

export interface CompatibilityHouseOverlaySelector {
  readonly kind: "house-overlay";
  readonly sourceChart?: SynastryChartSide;
  readonly sourceBody?: CelestialBody;
  readonly targetChart?: SynastryChartSide;
  readonly targetHouseNumber?: number;
}

export type CompatibilityFactSelector =
  | CompatibilityPhaseOneSelector
  | CompatibilitySynastrySelector
  | CompatibilityHouseOverlaySelector;

export interface CompatibilityCategoryDefinition {
  readonly id: string;
  readonly baseline: number;
  readonly minimum: number;
  readonly maximum: number;
}

export interface CompatibilityCategoryRule {
  readonly id: string;
  readonly categoryId: string;
  readonly selector: CompatibilityFactSelector;
  readonly impact: number;
  readonly confidence: number;
  readonly rationale: string;
}

export interface CompatibilityCategoryPolicy {
  readonly id: string;
  readonly version: string;
  readonly categories: readonly CompatibilityCategoryDefinition[];
  readonly rules: readonly CompatibilityCategoryRule[];
}

export interface CompatibilityCategoryContribution {
  readonly ruleId: string;
  readonly sourceFactId: string;
  readonly impact: number;
  readonly confidence: number;
  readonly rationale: string;
}

export interface CompatibilityCategoryScore {
  readonly categoryId: string;
  readonly label: "interpretive product heuristic";
  readonly baseline: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly contributionTotal: number;
  readonly rawScore: number;
  readonly score: number;
  readonly confidence: number;
  readonly sourceFactIds: readonly string[];
  readonly contributions: readonly CompatibilityCategoryContribution[];
}
