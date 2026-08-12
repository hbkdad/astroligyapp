import type {
  CompatibilityCategoryPolicy,
  CompatibilityCategoryRule,
} from "@/domain/compatibility/scoring";
import type { AspectType } from "@/domain/astro/aspects";
import type { CelestialBody } from "@/domain/astro/contracts";

const ASPECT_IMPACTS: Readonly<Record<AspectType, number>> = Object.freeze({
  conjunction: 3,
  sextile: 3,
  square: -2,
  trine: 4,
  opposition: -2,
});

export const INITIAL_COMPATIBILITY_CATEGORY_POLICY: CompatibilityCategoryPolicy =
  deepFreeze({
    id: "initial-compatibility-categories",
    version: "1.0.0",
    categories: [
      { id: "attraction", baseline: 50, minimum: 0, maximum: 100 },
      { id: "communication", baseline: 50, minimum: 0, maximum: 100 },
      { id: "emotional", baseline: 50, minimum: 0, maximum: 100 },
      { id: "long-term", baseline: 50, minimum: 0, maximum: 100 },
      { id: "chemistry", baseline: 50, minimum: 0, maximum: 100 },
    ],
    rules: [
      phaseRule("attraction-same-sign", "attraction", "zodiac.signs", 1),
      ...bodyPairRules("attraction", "venus", "mars"),
      ...bodyPairRules("attraction", "sun", "venus"),
      ...overlayRules("attraction", ["venus", "mars"], [1, 5, 7, 8]),

      phaseRule(
        "communication-expression-match",
        "communication",
        "numerology.expression",
        2,
      ),
      ...singlePairRules("communication", "mercury", "mercury"),
      ...bodyPairRules("communication", "mercury", "sun"),
      ...bodyPairRules("communication", "mercury", "moon"),
      ...overlayRules("communication", ["mercury"], [3, 7]),

      phaseRule("emotional-element-match", "emotional", "zodiac.elements", 2),
      ...singlePairRules("emotional", "moon", "moon"),
      ...bodyPairRules("emotional", "moon", "venus"),
      ...bodyPairRules("emotional", "moon", "sun"),
      ...overlayRules("emotional", ["moon"], [4, 7, 8]),

      phaseRule(
        "long-term-modality-match",
        "long-term",
        "zodiac.modalities",
        2,
      ),
      phaseRule(
        "long-term-life-path-match",
        "long-term",
        "numerology.lifePath",
        2,
      ),
      ...bodyPairRules("long-term", "saturn", "sun"),
      ...bodyPairRules("long-term", "saturn", "moon"),
      ...overlayRules("long-term", ["saturn"], [4, 7, 10]),

      phaseRule("chemistry-element-match", "chemistry", "zodiac.elements", 1),
      ...bodyPairRules("chemistry", "mars", "moon"),
      ...bodyPairRules("chemistry", "venus", "pluto"),
      ...overlayRules("chemistry", ["mars", "venus"], [5, 8]),
    ],
  });

function phaseRule(
  id: string,
  categoryId: string,
  fact:
    | "zodiac.signs"
    | "zodiac.elements"
    | "zodiac.modalities"
    | "numerology.lifePath"
    | "numerology.expression",
  impact: number,
): CompatibilityCategoryRule {
  return {
    id,
    categoryId,
    selector: { kind: "phase-one-pair", fact, equal: true },
    impact,
    confidence: 0.55,
    rationale: `Tradition-framed configured contribution for matching ${fact}.`,
  };
}

function bodyPairRules(
  categoryId: string,
  firstBody: CelestialBody,
  secondBody: CelestialBody,
): readonly CompatibilityCategoryRule[] {
  return [
    ...singlePairRules(categoryId, firstBody, secondBody),
    ...singlePairRules(categoryId, secondBody, firstBody),
  ];
}

function singlePairRules(
  categoryId: string,
  firstBody: CelestialBody,
  secondBody: CelestialBody,
): readonly CompatibilityCategoryRule[] {
  return (Object.entries(ASPECT_IMPACTS) as [AspectType, number][]).map(
    ([aspectType, impact]) => ({
      id: `${categoryId}-${firstBody}-${secondBody}-${aspectType}`,
      categoryId,
      selector: {
        kind: "synastry-aspect" as const,
        firstBody,
        secondBody,
        aspectType,
      },
      impact,
      confidence: 0.55,
      rationale: `Tradition-framed configured contribution for ${firstBody}-${secondBody} ${aspectType}.`,
    }),
  );
}

function overlayRules(
  categoryId: string,
  bodies: readonly CelestialBody[],
  houses: readonly number[],
): readonly CompatibilityCategoryRule[] {
  return bodies.flatMap((sourceBody) =>
    houses.map((targetHouseNumber) => ({
      id: `${categoryId}-${sourceBody}-house-${targetHouseNumber}`,
      categoryId,
      selector: {
        kind: "house-overlay" as const,
        sourceBody,
        targetHouseNumber,
      },
      impact: 2,
      confidence: 0.5,
      rationale: `Tradition-framed configured contribution for ${sourceBody} in relationship house ${targetHouseNumber}.`,
    })),
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
