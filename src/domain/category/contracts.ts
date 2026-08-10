import type {
  InterpretationParameterValue,
  InterpretationTemplateKey,
} from "@/domain/interpretation/contracts";

export const CATEGORY_KEYS = [
  "love",
  "career",
  "finance",
  "energy",
  "communication",
  "creativity",
  "relationships",
  "personal-growth",
  "friction",
  "opportunity",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export interface CategoryRule {
  readonly id: string;
  readonly category: CategoryKey;
  readonly templateKey: InterpretationTemplateKey;
  readonly parameterMatches: Readonly<
    Record<string, InterpretationParameterValue>
  >;
  readonly impact: number;
  readonly confidence: number;
  readonly rationale: string;
}

export interface CategoryScoreModel {
  readonly id: string;
  readonly version: string;
  readonly baseline: number;
  readonly categories: readonly CategoryKey[];
  readonly rules: readonly CategoryRule[];
}

export interface CategoryContribution {
  readonly ruleId: string;
  readonly sourceFactId: string;
  readonly projectionKey: string;
  readonly impact: number;
  readonly confidence: number;
  readonly rationale: string;
}

export interface CategoryScore {
  readonly category: CategoryKey;
  readonly label: "interpretive product heuristic";
  readonly baseline: number;
  readonly contributionTotal: number;
  readonly rawScore: number;
  readonly score: number;
  readonly confidence: number;
  readonly sourceFactIds: readonly string[];
  readonly contributingFactors: readonly CategoryContribution[];
}
