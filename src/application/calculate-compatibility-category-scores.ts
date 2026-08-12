import {
  COMPATIBILITY_FACT_AGGREGATE_VERSION,
  composeCompatibilityFacts,
  type CompatibilityFactAggregate,
} from "@/application/compose-compatibility-facts";
import { ASPECT_TYPES } from "@/domain/astro/aspects";
import { CELESTIAL_BODIES } from "@/domain/astro/contracts";
import { ZODIAC_SIGNS } from "@/domain/astro/zodiac";
import { SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES } from "@/domain/compatibility/phase-one";
import {
  COMPATIBILITY_PHASE_ONE_FACT_KEYS,
  type CompatibilityCategoryContribution,
  type CompatibilityCategoryDefinition,
  type CompatibilityCategoryPolicy,
  type CompatibilityCategoryRule,
  type CompatibilityCategoryScore,
  type CompatibilityFactSelector,
  type CompatibilityPhaseOneFactKey,
} from "@/domain/compatibility/scoring";

export const COMPATIBILITY_CATEGORY_SCORE_RESULT_VERSION = "1.0.0";
export const COMPATIBILITY_CATEGORY_SCORE_FORMULA_VERSION = "1.0.0";
export const COMPATIBILITY_CATEGORY_SCORE_DISCLAIMER =
  "These configured category scores are non-scientific interpretive product heuristics, not measurements, predictions, or relationship advice.";

export interface CompatibilityCategoryScoreResult {
  readonly version: string;
  readonly sourceVersions: Readonly<{
    aggregate: string;
    phaseOne: string;
    synastry: string;
    houseOverlays: string;
  }>;
  readonly policy: Readonly<{ id: string; version: string }>;
  readonly formula: Readonly<{
    version: string;
    score: "clamp(round(baseline + sum(impact)), minimum, maximum)";
    confidence: "weighted mean by absolute impact; 0 without impact";
  }>;
  readonly categories: readonly CompatibilityCategoryScore[];
  readonly disclaimer: string;
}

export class InvalidCompatibilityScoringInputError extends Error {
  constructor() {
    super("Compatibility scoring aggregate or policy is invalid");
    this.name = "InvalidCompatibilityScoringInputError";
  }
}

interface SelectableFact {
  readonly id: string;
  readonly selectorKind: CompatibilityFactSelector["kind"];
  readonly value: unknown;
}

export function calculateCompatibilityCategoryScores(
  aggregate: CompatibilityFactAggregate,
  policy: CompatibilityCategoryPolicy,
): CompatibilityCategoryScoreResult {
  try {
    validateAggregate(aggregate);
    validatePolicy(policy);
    const facts = selectableFacts(aggregate);
    const categories = policy.categories.map((category) =>
      scoreCategory(
        category,
        policy.rules.flatMap((rule) =>
          rule.categoryId === category.id
            ? matchingContributions(rule, facts)
            : [],
        ),
      ),
    );
    return deepFreeze({
      version: COMPATIBILITY_CATEGORY_SCORE_RESULT_VERSION,
      sourceVersions: {
        aggregate: COMPATIBILITY_FACT_AGGREGATE_VERSION,
        phaseOne: aggregate.phaseOne.version,
        synastry: aggregate.synastry.version,
        houseOverlays: aggregate.houseOverlays.version,
      },
      policy: { id: policy.id, version: policy.version },
      formula: {
        version: COMPATIBILITY_CATEGORY_SCORE_FORMULA_VERSION,
        score:
          "clamp(round(baseline + sum(impact)), minimum, maximum)" as const,
        confidence:
          "weighted mean by absolute impact; 0 without impact" as const,
      },
      categories,
      disclaimer: COMPATIBILITY_CATEGORY_SCORE_DISCLAIMER,
    });
  } catch {
    throw new InvalidCompatibilityScoringInputError();
  }
}

function validateAggregate(aggregate: CompatibilityFactAggregate): void {
  const rebuilt = composeCompatibilityFacts({
    phaseOne: aggregate.phaseOne,
    synastry: aggregate.synastry,
    houseOverlays: aggregate.houseOverlays,
  });
  if (!sameValue(aggregate, rebuilt)) invalid();
}

function validatePolicy(policy: CompatibilityCategoryPolicy): void {
  requireExactKeys(policy, ["id", "version", "categories", "rules"]);
  if (
    !safeText(policy.id, 128) ||
    !safeText(policy.version, 128) ||
    !Array.isArray(policy.categories) ||
    policy.categories.length === 0 ||
    !Array.isArray(policy.rules)
  )
    invalid();
  const categoryIds = policy.categories.map((category) => category.id);
  if (new Set(categoryIds).size !== categoryIds.length) invalid();
  policy.categories.forEach(validateCategory);
  const ruleIds = policy.rules.map((rule) => rule.id);
  if (new Set(ruleIds).size !== ruleIds.length) invalid();
  policy.rules.forEach((rule) => validateRule(rule, categoryIds));
}

function validateCategory(category: CompatibilityCategoryDefinition): void {
  requireExactKeys(category, ["id", "baseline", "minimum", "maximum"]);
  if (
    !safeIdentifier(category.id) ||
    !Number.isSafeInteger(category.minimum) ||
    !Number.isSafeInteger(category.maximum) ||
    !Number.isSafeInteger(category.baseline) ||
    category.minimum < 0 ||
    category.maximum > 100 ||
    category.minimum >= category.maximum ||
    category.baseline < category.minimum ||
    category.baseline > category.maximum
  )
    invalid();
}

function validateRule(
  rule: CompatibilityCategoryRule,
  categoryIds: readonly string[],
): void {
  requireExactKeys(rule, [
    "id",
    "categoryId",
    "selector",
    "impact",
    "confidence",
    "rationale",
  ]);
  if (
    !safeIdentifier(rule.id) ||
    !categoryIds.includes(rule.categoryId) ||
    !Number.isFinite(rule.impact) ||
    rule.impact < -100 ||
    rule.impact > 100 ||
    !Number.isFinite(rule.confidence) ||
    rule.confidence < 0 ||
    rule.confidence > 1 ||
    !safeRationale(rule.rationale)
  )
    invalid();
  validateSelector(rule.selector);
}

function validateSelector(selector: CompatibilityFactSelector): void {
  if (!selector || typeof selector !== "object") invalid();
  if (selector.kind === "phase-one-pair") {
    requireAllowedKeys(selector, [
      "kind",
      "fact",
      "equal",
      "values",
      "masterNumberCount",
    ]);
    if (!COMPATIBILITY_PHASE_ONE_FACT_KEYS.includes(selector.fact)) invalid();
    if (selector.equal !== undefined && typeof selector.equal !== "boolean")
      invalid();
    validatePhaseValues(selector.fact, selector.values);
    const numerology = selector.fact.startsWith("numerology.");
    if (
      selector.masterNumberCount !== undefined &&
      (!numerology || ![0, 1, 2].includes(selector.masterNumberCount))
    )
      invalid();
    return;
  }
  if (selector.kind === "synastry-aspect") {
    requireAllowedKeys(selector, [
      "kind",
      "firstBody",
      "secondBody",
      "aspectType",
      "phase",
      "minimumStrength",
    ]);
    if (
      (selector.firstBody !== undefined &&
        !CELESTIAL_BODIES.includes(selector.firstBody)) ||
      (selector.secondBody !== undefined &&
        !CELESTIAL_BODIES.includes(selector.secondBody)) ||
      (selector.aspectType !== undefined &&
        !ASPECT_TYPES.includes(selector.aspectType)) ||
      (selector.phase !== undefined &&
        !["applying", "separating", "stationary", "unknown"].includes(
          selector.phase,
        )) ||
      (selector.minimumStrength !== undefined &&
        (!Number.isFinite(selector.minimumStrength) ||
          selector.minimumStrength < 0 ||
          selector.minimumStrength > 1)) ||
      Object.keys(selector).length === 1
    )
      invalid();
    return;
  }
  if (selector.kind === "house-overlay") {
    requireAllowedKeys(selector, [
      "kind",
      "sourceChart",
      "sourceBody",
      "targetChart",
      "targetHouseNumber",
    ]);
    if (
      (selector.sourceChart !== undefined &&
        !["chart-a", "chart-b"].includes(selector.sourceChart)) ||
      (selector.targetChart !== undefined &&
        !["chart-a", "chart-b"].includes(selector.targetChart)) ||
      (selector.sourceBody !== undefined &&
        !CELESTIAL_BODIES.includes(selector.sourceBody)) ||
      (selector.targetHouseNumber !== undefined &&
        (!Number.isSafeInteger(selector.targetHouseNumber) ||
          selector.targetHouseNumber < 1 ||
          selector.targetHouseNumber > 12)) ||
      Object.keys(selector).length === 1
    )
      invalid();
    return;
  }
  invalid();
}

function validatePhaseValues(
  fact: CompatibilityPhaseOneFactKey,
  values: readonly [string | number, string | number] | undefined,
): void {
  if (values === undefined) return;
  if (!Array.isArray(values) || values.length !== 2) invalid();
  if (fact.startsWith("numerology.")) {
    if (
      values.some(
        (value) =>
          !Number.isSafeInteger(value) ||
          !SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES.includes(
            value as (typeof SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES)[number],
          ),
      ) ||
      (values[0] as number) > (values[1] as number)
    )
      invalid();
    return;
  }
  const allowed =
    fact === "zodiac.signs"
      ? ZODIAC_SIGNS
      : fact === "zodiac.elements"
        ? (["air", "earth", "fire", "water"] as const)
        : (["cardinal", "fixed", "mutable"] as const);
  if (
    values.some(
      (value) => typeof value !== "string" || !allowed.includes(value as never),
    ) ||
    allowed.indexOf(values[0] as never) > allowed.indexOf(values[1] as never)
  )
    invalid();
}

function selectableFacts(
  aggregate: CompatibilityFactAggregate,
): readonly SelectableFact[] {
  const phase = aggregate.phaseOne;
  return [
    phaseFact("zodiac.signs", phase.zodiac.signs),
    phaseFact("zodiac.elements", phase.zodiac.elements),
    phaseFact("zodiac.modalities", phase.zodiac.modalities),
    phaseFact("numerology.lifePath", phase.numerology.lifePath),
    phaseFact("numerology.expression", phase.numerology.expression),
    ...aggregate.synastry.aspects.map((aspect) => ({
      id: aspect.id,
      selectorKind: "synastry-aspect" as const,
      value: aspect,
    })),
    ...aggregate.houseOverlays.overlays.map((overlay) => ({
      id: overlay.id,
      selectorKind: "house-overlay" as const,
      value: overlay,
    })),
  ];
}

function phaseFact(
  fact: CompatibilityPhaseOneFactKey,
  value: unknown,
): SelectableFact {
  return {
    id: `compatibility:phase-one:${fact}`,
    selectorKind: "phase-one-pair",
    value,
  };
}

function matchingContributions(
  rule: CompatibilityCategoryRule,
  facts: readonly SelectableFact[],
): readonly CompatibilityCategoryContribution[] {
  return facts
    .filter(
      (fact) =>
        fact.selectorKind === rule.selector.kind &&
        matchesSelector(fact, rule.selector),
    )
    .map((fact) => ({
      ruleId: rule.id,
      sourceFactId: fact.id,
      impact: rule.impact,
      confidence: rule.confidence,
      rationale: rule.rationale,
    }));
}

function matchesSelector(
  fact: SelectableFact,
  selector: CompatibilityFactSelector,
): boolean {
  if (selector.kind === "phase-one-pair") {
    if (fact.id !== `compatibility:phase-one:${selector.fact}`) return false;
    const value = fact.value as {
      readonly values: readonly (string | number)[];
      readonly equal: boolean;
      readonly masterNumberCount?: number;
    };
    return (
      (selector.equal === undefined || value.equal === selector.equal) &&
      (selector.values === undefined ||
        sameValue(value.values, selector.values)) &&
      (selector.masterNumberCount === undefined ||
        value.masterNumberCount === selector.masterNumberCount)
    );
  }
  if (selector.kind === "synastry-aspect") {
    const value =
      fact.value as CompatibilityFactAggregate["synastry"]["aspects"][number];
    return (
      (selector.firstBody === undefined ||
        value.first.body === selector.firstBody) &&
      (selector.secondBody === undefined ||
        value.second.body === selector.secondBody) &&
      (selector.aspectType === undefined ||
        value.type === selector.aspectType) &&
      (selector.phase === undefined || value.phase === selector.phase) &&
      (selector.minimumStrength === undefined ||
        value.normalizedStrength >= selector.minimumStrength)
    );
  }
  const value =
    fact.value as CompatibilityFactAggregate["houseOverlays"]["overlays"][number];
  return (
    (selector.sourceChart === undefined ||
      value.source.chart === selector.sourceChart) &&
    (selector.sourceBody === undefined ||
      value.source.body === selector.sourceBody) &&
    (selector.targetChart === undefined ||
      value.target.chart === selector.targetChart) &&
    (selector.targetHouseNumber === undefined ||
      value.target.houseNumber === selector.targetHouseNumber)
  );
}

function scoreCategory(
  category: CompatibilityCategoryDefinition,
  contributions: readonly CompatibilityCategoryContribution[],
): CompatibilityCategoryScore {
  const contributionTotal = precise(
    contributions.reduce((sum, contribution) => sum + contribution.impact, 0),
  );
  const rawScore = precise(category.baseline + contributionTotal);
  if (!Number.isFinite(rawScore)) invalid();
  const totalWeight = contributions.reduce(
    (sum, contribution) => sum + Math.abs(contribution.impact),
    0,
  );
  const confidence =
    totalWeight === 0
      ? 0
      : precise(
          contributions.reduce(
            (sum, contribution) =>
              sum + Math.abs(contribution.impact) * contribution.confidence,
            0,
          ) / totalWeight,
        );
  return {
    categoryId: category.id,
    label: "interpretive product heuristic",
    baseline: category.baseline,
    minimum: category.minimum,
    maximum: category.maximum,
    contributionTotal,
    rawScore,
    score: Math.min(
      category.maximum,
      Math.max(category.minimum, Math.round(rawScore)),
    ),
    confidence,
    sourceFactIds: [
      ...new Set(
        contributions.map((contribution) => contribution.sourceFactId),
      ),
    ],
    contributions,
  };
}

function requireExactKeys(value: object, keys: readonly string[]): void {
  if (!sameValue(Object.keys(value).sort(), [...keys].sort())) invalid();
}

function requireAllowedKeys(value: object, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid();
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}

function safeText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\r\n<>]/.test(value)
  );
}

function safeRationale(value: unknown): value is string {
  return (
    safeText(value, 256) &&
    !/\b(guarantee(?:d|s)?|perfect match|soulmate|destined|fated|will marry|should (?:marry|leave|stay))\b/i.test(
      value,
    )
  );
}

function precise(value: number): number {
  return Number(value.toFixed(6));
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function invalid(): never {
  throw new RangeError("Invalid compatibility scoring input");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
