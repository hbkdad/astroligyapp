import {
  calculateCompatibilityCategoryScores,
  type CompatibilityCategoryScoreResult,
} from "@/application/calculate-compatibility-category-scores";
import {
  composeCompatibilityFacts,
  type CompatibilityFactAggregate,
} from "@/application/compose-compatibility-facts";
import { INITIAL_COMPATIBILITY_CATEGORY_POLICY } from "@/config/compatibility-category-policy";
import type { CompatibilityCategoryPolicy } from "@/domain/compatibility/scoring";

export const COMPATIBILITY_CONTENT_PROJECTION_VERSION = "1.0.0";
export const COMPATIBILITY_CONTENT_DISCLAIMER =
  "These keys reference calculated facts and tradition-framed product heuristics; they are not relationship predictions or advice.";

export const COMPATIBILITY_FACT_CONTENT_KEYS = [
  "compatibility.fact.phase-one-pair",
  "compatibility.fact.phase-one-numerology-pair",
  "compatibility.fact.synastry-aspect",
  "compatibility.fact.house-overlay",
] as const;

export const COMPATIBILITY_CATEGORY_IDS = [
  "attraction",
  "communication",
  "emotional",
  "long-term",
  "chemistry",
] as const;

export const COMPATIBILITY_REFLECTION_TONES = [
  "supportive",
  "challenging",
  "neutral",
] as const;

export type CompatibilityFactContentKey =
  (typeof COMPATIBILITY_FACT_CONTENT_KEYS)[number];
export type CompatibilityCategoryId =
  (typeof COMPATIBILITY_CATEGORY_IDS)[number];
export type CompatibilityReflectionTone =
  (typeof COMPATIBILITY_REFLECTION_TONES)[number];
export type CompatibilityReflectionContentKey =
  `compatibility.reflection.${CompatibilityCategoryId}.${CompatibilityReflectionTone}`;
export type CompatibilityContentParameter = string | number | boolean;

export interface CompatibilityContentProjectionItem {
  readonly id: string;
  readonly categoryId: CompatibilityCategoryId;
  readonly sourceFactId: string;
  readonly ruleId: string;
  readonly factKey: CompatibilityFactContentKey;
  readonly reflectionKey: CompatibilityReflectionContentKey;
  readonly tone: CompatibilityReflectionTone;
  readonly impact: number;
  readonly confidence: number;
  readonly parameters: Readonly<Record<string, CompatibilityContentParameter>>;
}

export interface CompatibilityContentProjection {
  readonly version: string;
  readonly sourceVersions: Readonly<{
    aggregate: string;
    phaseOne: string;
    synastry: string;
    houseOverlays: string;
    scoringResult: string;
    scoringFormula: string;
    scoringPolicy: string;
  }>;
  readonly items: readonly CompatibilityContentProjectionItem[];
  readonly disclaimer: string;
}

export class InvalidCompatibilityContentInputError extends Error {
  constructor() {
    super("Compatibility content projection input is invalid or inconsistent");
    this.name = "InvalidCompatibilityContentInputError";
  }
}

export function projectCompatibilityContent(
  aggregate: CompatibilityFactAggregate,
  scores: CompatibilityCategoryScoreResult,
  policy: CompatibilityCategoryPolicy = INITIAL_COMPATIBILITY_CATEGORY_POLICY,
): CompatibilityContentProjection {
  try {
    validateSources(aggregate, scores, policy);
    return deepFreeze(buildProjection(aggregate, scores));
  } catch {
    throw new InvalidCompatibilityContentInputError();
  }
}

export function validateCompatibilityContentProjection(
  projection: CompatibilityContentProjection,
  aggregate: CompatibilityFactAggregate,
  scores: CompatibilityCategoryScoreResult,
  policy: CompatibilityCategoryPolicy = INITIAL_COMPATIBILITY_CATEGORY_POLICY,
): void {
  try {
    validateSources(aggregate, scores, policy);
    const expected = buildProjection(aggregate, scores);
    if (!sameValue(projection, expected)) invalid();
  } catch {
    throw new InvalidCompatibilityContentInputError();
  }
}

function validateSources(
  aggregate: CompatibilityFactAggregate,
  scores: CompatibilityCategoryScoreResult,
  policy: CompatibilityCategoryPolicy,
): void {
  const rebuiltAggregate = composeCompatibilityFacts({
    phaseOne: aggregate.phaseOne,
    synastry: aggregate.synastry,
    houseOverlays: aggregate.houseOverlays,
  });
  if (!sameValue(aggregate, rebuiltAggregate)) invalid();
  if (!sameValue(policy, INITIAL_COMPATIBILITY_CATEGORY_POLICY)) invalid();
  const rebuiltScores = calculateCompatibilityCategoryScores(aggregate, policy);
  if (!sameValue(scores, rebuiltScores)) invalid();
}

function buildProjection(
  aggregate: CompatibilityFactAggregate,
  scores: CompatibilityCategoryScoreResult,
): CompatibilityContentProjection {
  const factMap = selectableFactMap(aggregate);
  const items = scores.categories.flatMap((category) => {
    if (!COMPATIBILITY_CATEGORY_IDS.includes(category.categoryId as never))
      invalid();
    return category.contributions.map((contribution) => {
      const fact = factMap.get(contribution.sourceFactId);
      if (!fact) invalid();
      const categoryId = category.categoryId as CompatibilityCategoryId;
      const tone = toneFor(contribution.impact);
      return {
        id: `compatibility-content:${categoryId}:${contribution.ruleId}:${contribution.sourceFactId}`,
        categoryId,
        sourceFactId: contribution.sourceFactId,
        ruleId: contribution.ruleId,
        factKey: fact.factKey,
        reflectionKey:
          `compatibility.reflection.${categoryId}.${tone}` as CompatibilityReflectionContentKey,
        tone,
        impact: contribution.impact,
        confidence: contribution.confidence,
        parameters: fact.parameters,
      };
    });
  });
  const identities = items.map((item) => item.id);
  if (new Set(identities).size !== identities.length) invalid();
  return {
    version: COMPATIBILITY_CONTENT_PROJECTION_VERSION,
    sourceVersions: {
      aggregate: scores.sourceVersions.aggregate,
      phaseOne: scores.sourceVersions.phaseOne,
      synastry: scores.sourceVersions.synastry,
      houseOverlays: scores.sourceVersions.houseOverlays,
      scoringResult: scores.version,
      scoringFormula: scores.formula.version,
      scoringPolicy: scores.policy.version,
    },
    items,
    disclaimer: COMPATIBILITY_CONTENT_DISCLAIMER,
  };
}

function selectableFactMap(aggregate: CompatibilityFactAggregate) {
  const phase = aggregate.phaseOne;
  return new Map<string, FactContentSource>([
    phaseSource("zodiac.signs", phase.zodiac.signs),
    phaseSource("zodiac.elements", phase.zodiac.elements),
    phaseSource("zodiac.modalities", phase.zodiac.modalities),
    phaseSource("numerology.lifePath", phase.numerology.lifePath),
    phaseSource("numerology.expression", phase.numerology.expression),
    ...aggregate.synastry.aspects.map(
      (aspect) =>
        [
          aspect.id,
          {
            factKey: "compatibility.fact.synastry-aspect" as const,
            parameters: {
              firstBody: aspect.first.body,
              secondBody: aspect.second.body,
              aspectType: aspect.type,
              orbDegrees: aspect.orbDegrees,
              phase: aspect.phase,
              normalizedStrength: aspect.normalizedStrength,
            },
          },
        ] as const,
    ),
    ...aggregate.houseOverlays.overlays.map(
      (overlay) =>
        [
          overlay.id,
          {
            factKey: "compatibility.fact.house-overlay" as const,
            parameters: {
              sourceBody: overlay.source.body,
              targetHouseNumber: overlay.target.houseNumber,
            },
          },
        ] as const,
    ),
  ]);
}

interface FactContentSource {
  readonly factKey: CompatibilityFactContentKey;
  readonly parameters: Readonly<Record<string, CompatibilityContentParameter>>;
}

function phaseSource(
  name: string,
  fact: Readonly<{
    values: readonly (string | number)[];
    equal: boolean;
    masterNumberCount?: number;
  }>,
): readonly [string, FactContentSource] {
  return [
    `compatibility:phase-one:${name}`,
    {
      factKey:
        fact.masterNumberCount === undefined
          ? "compatibility.fact.phase-one-pair"
          : "compatibility.fact.phase-one-numerology-pair",
      parameters: {
        fact: name,
        firstValue: fact.values[0]!,
        secondValue: fact.values[1]!,
        equal: fact.equal,
        ...(fact.masterNumberCount === undefined
          ? {}
          : { masterNumberCount: fact.masterNumberCount }),
      },
    },
  ];
}

function toneFor(impact: number): CompatibilityReflectionTone {
  return impact > 0 ? "supportive" : impact < 0 ? "challenging" : "neutral";
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function invalid(): never {
  throw new RangeError("Invalid compatibility content projection");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
