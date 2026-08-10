import type { PersonalContextFacts } from "./compose-personal-context";
import {
  INTERPRETATION_PROJECTION_VERSION,
  projectInterpretationKeys,
} from "./project-interpretations";
import { DEFAULT_CATEGORY_SCORE_MODEL } from "@/config/category-model";
import {
  CATEGORY_KEYS,
  type CategoryContribution,
  type CategoryRule,
  type CategoryScore,
  type CategoryScoreModel,
} from "@/domain/category/contracts";
import {
  INTERPRETATION_TEMPLATE_KEYS,
  type InterpretationProjection,
  type InterpretationTemplateKey,
} from "@/domain/interpretation/contracts";

export const CATEGORY_SCORE_FORMULA_VERSION = "1.0.0";

export interface CategoryScoreOutput {
  readonly effectiveAt: string;
  readonly scores: readonly CategoryScore[];
  readonly metadata: Readonly<{
    label: "interpretive product heuristic; not a scientific measurement";
    modelId: string;
    modelVersion: string;
    formulaVersion: string;
    contextVersion: string;
    projectionVersion: string;
    scoreFormula: "clamp(round(baseline + sum(impact)), 0, 100)";
    confidenceFormula: "weighted mean by absolute impact; 0 without factors";
  }>;
}

const TEMPLATE_PARAMETER_KEYS: Readonly<
  Record<InterpretationTemplateKey, readonly string[]>
> = {
  "natal-placement": ["body", "sign", "degreeWithinSign", "houseNumber"],
  "natal-aspect": ["firstBody", "aspectType", "secondBody", "orbDegrees"],
  "transit-aspect": [
    "transitingBody",
    "aspectType",
    "targetLabel",
    "orbDegrees",
    "phase",
  ],
  "lunar-phase": [
    "phase",
    "moonSign",
    "phaseAngleDegrees",
    "approximateIlluminatedFraction",
  ],
  "personal-lunar-aspect": ["aspectType", "targetLabel", "orbDegrees", "phase"],
  "numerology-value": [
    "numerologyKey",
    "value",
    "masterNumber",
    "strategyId",
    "strategyVersion",
  ],
};

export function calculatePersonalCategoryScores(
  context: PersonalContextFacts,
  model: CategoryScoreModel = DEFAULT_CATEGORY_SCORE_MODEL,
): CategoryScoreOutput {
  const projections = projectInterpretationKeys(context);
  validateModel(model);
  validateFactCoverage(context, projections);

  const scores = model.categories.map((category) => {
    const contributions = model.rules
      .filter((rule) => rule.category === category)
      .flatMap((rule) => matchingContributions(rule, projections));
    return scoreCategory(category, model.baseline, contributions);
  });

  return deepFreeze({
    effectiveAt: context.effectiveAt,
    scores,
    metadata: {
      label:
        "interpretive product heuristic; not a scientific measurement" as const,
      modelId: model.id,
      modelVersion: model.version,
      formulaVersion: CATEGORY_SCORE_FORMULA_VERSION,
      contextVersion: context.metadata.contextVersion,
      projectionVersion: INTERPRETATION_PROJECTION_VERSION,
      scoreFormula: "clamp(round(baseline + sum(impact)), 0, 100)" as const,
      confidenceFormula:
        "weighted mean by absolute impact; 0 without factors" as const,
    },
  });
}

function validateModel(model: CategoryScoreModel): void {
  validateText(model.id, "Score model ID");
  validateText(model.version, "Score model version");
  if (
    !Number.isFinite(model.baseline) ||
    model.baseline < 0 ||
    model.baseline > 100
  ) {
    throw new RangeError("Score model baseline must be between 0 and 100");
  }
  if (
    model.categories.length === 0 ||
    new Set(model.categories).size !== model.categories.length ||
    model.categories.some((category) => !CATEGORY_KEYS.includes(category))
  ) {
    throw new RangeError("Score model categories are invalid");
  }
  if (new Set(model.rules.map((rule) => rule.id)).size !== model.rules.length) {
    throw new RangeError("Category rule IDs must be unique");
  }
  for (const rule of model.rules) validateRule(rule, model);
}

function validateRule(rule: CategoryRule, model: CategoryScoreModel): void {
  validateText(rule.id, "Category rule ID");
  validateText(rule.rationale, "Category rule rationale");
  if (!model.categories.includes(rule.category)) {
    throw new RangeError(
      `Category rule ${rule.id} references an unknown category`,
    );
  }
  if (!INTERPRETATION_TEMPLATE_KEYS.includes(rule.templateKey)) {
    throw new RangeError(
      `Category rule ${rule.id} has an invalid template key`,
    );
  }
  if (
    !Number.isFinite(rule.impact) ||
    rule.impact < -100 ||
    rule.impact > 100 ||
    !Number.isFinite(rule.confidence) ||
    rule.confidence < 0 ||
    rule.confidence > 1
  ) {
    throw new RangeError(`Category rule ${rule.id} has invalid weights`);
  }
  const matches = Object.entries(rule.parameterMatches);
  if (matches.length === 0) {
    throw new RangeError(`Category rule ${rule.id} must declare a selector`);
  }
  for (const [key, value] of matches) {
    if (
      !/^[a-z][A-Za-z0-9]*$/.test(key) ||
      !TEMPLATE_PARAMETER_KEYS[rule.templateKey].includes(key) ||
      !validPrimitive(value)
    ) {
      throw new RangeError(`Category rule ${rule.id} has an invalid selector`);
    }
  }
}

function validateFactCoverage(
  context: PersonalContextFacts,
  projections: readonly InterpretationProjection[],
): void {
  const factIds = context.facts.map((fact) => fact.id);
  const projectionFactIds = projections.map(
    (projection) => projection.sourceFactId,
  );
  if (
    factIds.length !== projectionFactIds.length ||
    factIds.some((id, index) => id !== projectionFactIds[index])
  ) {
    throw new RangeError(
      "Category inputs must reference every known fact exactly once",
    );
  }
}

function matchingContributions(
  rule: CategoryRule,
  projections: readonly InterpretationProjection[],
): readonly CategoryContribution[] {
  return projections
    .filter(
      (projection) =>
        projection.templateKey === rule.templateKey &&
        Object.entries(rule.parameterMatches).every(
          ([key, expected]) => projection.parameters[key] === expected,
        ),
    )
    .map((projection) => ({
      ruleId: rule.id,
      sourceFactId: projection.sourceFactId,
      projectionKey: projection.key,
      impact: rule.impact,
      confidence: rule.confidence,
      rationale: rule.rationale,
    }));
}

function scoreCategory(
  category: CategoryScore["category"],
  baseline: number,
  contributingFactors: readonly CategoryContribution[],
): CategoryScore {
  const contributionTotal = precise(
    contributingFactors.reduce((sum, factor) => sum + factor.impact, 0),
  );
  const rawScore = precise(baseline + contributionTotal);
  if (!Number.isFinite(rawScore)) {
    throw new RangeError(`Category ${category} produced non-finite arithmetic`);
  }
  const totalWeight = contributingFactors.reduce(
    (sum, factor) => sum + Math.abs(factor.impact),
    0,
  );
  const confidence =
    totalWeight === 0
      ? 0
      : precise(
          contributingFactors.reduce(
            (sum, factor) => sum + Math.abs(factor.impact) * factor.confidence,
            0,
          ) / totalWeight,
        );
  const sourceFactIds = [
    ...new Set(contributingFactors.map((factor) => factor.sourceFactId)),
  ];
  return {
    category,
    label: "interpretive product heuristic",
    baseline,
    contributionTotal,
    rawScore,
    score: Math.min(100, Math.max(0, Math.round(rawScore))),
    confidence,
    sourceFactIds,
    contributingFactors,
  };
}

function validPrimitive(value: unknown): boolean {
  return (
    (typeof value === "string" &&
      Boolean(value.trim()) &&
      value.length <= 128 &&
      !/[\r\n<>]/.test(value)) ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

function validateText(value: string, label: string): void {
  if (!value.trim() || value.length > 256 || /[\r\n<>]/.test(value)) {
    throw new RangeError(`${label} must be safe plain text`);
  }
}

function precise(value: number): number {
  return Number(value.toFixed(6));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
