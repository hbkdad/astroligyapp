import { describe, expect, it } from "vitest";

import {
  calculateNatalAspects,
  type NatalChart,
} from "@/application/calculate-natal-chart";
import {
  COMPATIBILITY_CATEGORY_SCORE_DISCLAIMER,
  COMPATIBILITY_CATEGORY_SCORE_FORMULA_VERSION,
  COMPATIBILITY_CATEGORY_SCORE_RESULT_VERSION,
  calculateCompatibilityCategoryScores,
  InvalidCompatibilityScoringInputError,
} from "@/application/calculate-compatibility-category-scores";
import { HouseOverlayEngine } from "@/application/calculate-house-overlays";
import {
  composeCompatibilityFacts,
  type CompatibilityFactAggregate,
} from "@/application/compose-compatibility-facts";
import { SynastryAspectEngine } from "@/application/calculate-synastry-aspects";
import { findHouseNumber } from "@/domain/astro/house-strategies";
import { toZodiacPosition, type ZodiacSign } from "@/domain/astro/zodiac";
import { PhaseOneCompatibilityStrategy } from "@/domain/compatibility/phase-one";
import type {
  CompatibilityCategoryDefinition,
  CompatibilityCategoryPolicy,
  CompatibilityCategoryRule,
  CompatibilityFactSelector,
} from "@/domain/compatibility/scoring";
import type { NumerologyResult } from "@/domain/numerology/contracts";
import { ZOLLIKON_NATAL_CHART_DEMO } from "@/presentation/natal-chart-demo";

const FIRST_LONGITUDES = [0, 18, 37, 59, 83, 111, 147, 191, 239, 301];
const SECOND_LONGITUDES = [180, 198, 217, 239, 263, 291, 327, 11, 59, 121];

describe("injected compatibility category scoring", () => {
  it("returns bounded categories with complete reconstructable contributions", () => {
    const policy = fixturePolicy();
    const result = calculateCompatibilityCategoryScores(aggregate(), policy);

    expect(result).toMatchObject({
      version: COMPATIBILITY_CATEGORY_SCORE_RESULT_VERSION,
      sourceVersions: {
        aggregate: "1.0.0",
        phaseOne: "1.0.0",
        synastry: "1.0.0",
        houseOverlays: "1.0.0",
      },
      policy: { id: "fixture-compatibility-policy", version: "1.0.0" },
      formula: {
        version: COMPATIBILITY_CATEGORY_SCORE_FORMULA_VERSION,
        score: "clamp(round(baseline + sum(impact)), minimum, maximum)",
        confidence: "weighted mean by absolute impact; 0 without impact",
      },
      disclaimer: COMPATIBILITY_CATEGORY_SCORE_DISCLAIMER,
    });
    expect(result.categories[0]).toEqual({
      categoryId: "connection",
      label: "interpretive product heuristic",
      baseline: 50,
      minimum: 0,
      maximum: 100,
      contributionTotal: 15,
      rawScore: 65,
      score: 65,
      confidence: 0.642857,
      sourceFactIds: [
        "compatibility:phase-one:zodiac.signs",
        "synastry:chart-a:sun:chart-b:sun:opposition",
        "house-overlay:chart-a:sun:in:chart-b:house:4",
      ],
      contributions: [
        {
          ruleId: "different-signs",
          sourceFactId: "compatibility:phase-one:zodiac.signs",
          impact: 5,
          confidence: 0.5,
          rationale: "Fixture rationale for different-signs.",
        },
        {
          ruleId: "sun-opposition",
          sourceFactId: "synastry:chart-a:sun:chart-b:sun:opposition",
          impact: 20,
          confidence: 0.8,
          rationale: "Fixture rationale for sun-opposition.",
        },
        {
          ruleId: "sun-house-four",
          sourceFactId: "house-overlay:chart-a:sun:in:chart-b:house:4",
          impact: -10,
          confidence: 0.4,
          rationale: "Fixture rationale for sun-house-four.",
        },
      ],
    });
    expect(result.categories[1]).toEqual({
      categoryId: "balance",
      label: "interpretive product heuristic",
      baseline: 40,
      minimum: 20,
      maximum: 80,
      contributionTotal: 0,
      rawScore: 40,
      score: 40,
      confidence: 0,
      sourceFactIds: [],
      contributions: [],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.categories[0]!.contributions)).toBe(true);
    expect(Object.isFrozen(policy)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /birth|observer|timezone|coordinateSource|private-source-marker|name|account|profile/,
    );
  });

  it("is byte-equivalent when the relationship inputs reverse", () => {
    const first = chart("fixture-a", FIRST_LONGITUDES);
    const second = chart("fixture-b", SECOND_LONGITUDES);
    const forward = calculateCompatibilityCategoryScores(
      aggregateFor(first, second),
      fixturePolicy(),
    );
    const reversed = calculateCompatibilityCategoryScores(
      aggregateFor(second, first),
      fixturePolicy(),
    );
    expect(reversed).toEqual(forward);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it("uses declared bounds, rounding, contribution precision, and weighted confidence", () => {
    const positive = calculateCompatibilityCategoryScores(
      aggregate(),
      policyWithRules([
        rule("positive-a", 100, 0.25),
        rule("positive-b", 0.1234567, 1),
      ]),
    ).categories[0]!;
    expect(positive).toMatchObject({
      contributionTotal: 100.123457,
      rawScore: 150.123457,
      score: 80,
      confidence: 0.250925,
    });

    const negative = calculateCompatibilityCategoryScores(
      aggregate(),
      policyWithRules([rule("negative", -100, 0.75)]),
    ).categories[0]!;
    expect(negative).toMatchObject({
      contributionTotal: -100,
      rawScore: -50,
      score: 20,
      confidence: 0.75,
    });
  });

  it("matches exact phase values, master counts, and strength boundaries", () => {
    const policy = policyWithRules([
      rule("exact-signs", 1, 1, {
        kind: "phase-one-pair",
        fact: "zodiac.signs",
        values: ["aries", "libra"],
      }),
      rule("master-count", 2, 1, {
        kind: "phase-one-pair",
        fact: "numerology.lifePath",
        values: [7, 11],
        masterNumberCount: 1,
      }),
      rule("exact-strength", 3, 1, {
        kind: "synastry-aspect",
        firstBody: "sun",
        secondBody: "sun",
        minimumStrength: 1,
      }),
    ]);
    const score = calculateCompatibilityCategoryScores(aggregate(), policy)
      .categories[0]!;
    expect(score.contributionTotal).toBe(6);
    expect(score.contributions).toHaveLength(3);
  });

  it.each([
    [
      "extra policy field",
      (policy: MutablePolicy) => {
        (policy as unknown as Record<string, unknown>).claim = "hidden";
      },
    ],
    [
      "duplicate category",
      (policy: MutablePolicy) => {
        policy.categories.push(structuredClone(policy.categories[0]!));
      },
    ],
    [
      "invalid bounds",
      (policy: MutablePolicy) => {
        policy.categories[0]!.minimum = 80;
        policy.categories[0]!.maximum = 20;
      },
    ],
    [
      "duplicate rule",
      (policy: MutablePolicy) => {
        policy.rules.push(structuredClone(policy.rules[0]!));
      },
    ],
    [
      "unknown category",
      (policy: MutablePolicy) => {
        policy.rules[0]!.categoryId = "unknown";
      },
    ],
    [
      "unbounded synastry selector",
      (policy: MutablePolicy) => {
        policy.rules[0]!.selector = { kind: "synastry-aspect" };
      },
    ],
    [
      "unknown selector field",
      (policy: MutablePolicy) => {
        (
          policy.rules[0]!.selector as unknown as Record<string, unknown>
        ).unknown = true;
      },
    ],
    [
      "invalid strength",
      (policy: MutablePolicy) => {
        policy.rules[0]!.selector = {
          kind: "synastry-aspect",
          minimumStrength: 1.000001,
        };
      },
    ],
    [
      "unknown phase value",
      (policy: MutablePolicy) => {
        policy.rules[0]!.selector = {
          kind: "phase-one-pair",
          fact: "zodiac.signs",
          values: ["aries", "ophiuchus"],
        };
      },
    ],
    [
      "noncanonical phase values",
      (policy: MutablePolicy) => {
        policy.rules[0]!.selector = {
          kind: "phase-one-pair",
          fact: "numerology.lifePath",
          values: [11, 7],
        };
      },
    ],
    [
      "misleading relationship claim",
      (policy: MutablePolicy) => {
        policy.rules[0]!.rationale = "This guarantees a perfect match.";
      },
    ],
  ])("rejects malformed policy: %s", (_, corrupt) => {
    const policy = structuredClone(fixturePolicy()) as MutablePolicy;
    corrupt(policy);
    expect(() =>
      calculateCompatibilityCategoryScores(aggregate(), policy),
    ).toThrow(InvalidCompatibilityScoringInputError);
    expect(() =>
      calculateCompatibilityCategoryScores(aggregate(), policy),
    ).toThrow("Compatibility scoring aggregate or policy is invalid");
  });

  it("rejects aggregate version drift and unknown private fields", () => {
    const versionDrift = structuredClone(aggregate()) as MutableAggregate;
    versionDrift.version = "2.0.0";
    expect(() =>
      calculateCompatibilityCategoryScores(versionDrift, fixturePolicy()),
    ).toThrow(InvalidCompatibilityScoringInputError);

    const privateField = structuredClone(aggregate());
    (privateField as unknown as Record<string, unknown>).birthDate =
      "1990-07-15";
    expect(() =>
      calculateCompatibilityCategoryScores(privateField, fixturePolicy()),
    ).toThrow(InvalidCompatibilityScoringInputError);
  });
});

function fixturePolicy(): CompatibilityCategoryPolicy {
  return {
    id: "fixture-compatibility-policy",
    version: "1.0.0",
    categories: [
      { id: "connection", baseline: 50, minimum: 0, maximum: 100 },
      { id: "balance", baseline: 40, minimum: 20, maximum: 80 },
    ],
    rules: [
      rule("different-signs", 5, 0.5, {
        kind: "phase-one-pair",
        fact: "zodiac.signs",
        equal: false,
      }),
      rule("sun-opposition", 20, 0.8, {
        kind: "synastry-aspect",
        firstBody: "sun",
        secondBody: "sun",
        aspectType: "opposition",
        minimumStrength: 1,
      }),
      rule("sun-house-four", -10, 0.4, {
        kind: "house-overlay",
        sourceChart: "chart-a",
        sourceBody: "sun",
        targetChart: "chart-b",
        targetHouseNumber: 4,
      }),
      {
        ...rule("unmatched-balance", 30, 0.9, {
          kind: "synastry-aspect",
          firstBody: "sun",
          secondBody: "sun",
          aspectType: "conjunction",
        }),
        categoryId: "balance",
      },
    ],
  };
}

function policyWithRules(
  rules: readonly CompatibilityCategoryRule[],
): CompatibilityCategoryPolicy {
  return {
    id: "boundary-policy",
    version: "1.0.0",
    categories: [{ id: "connection", baseline: 50, minimum: 20, maximum: 80 }],
    rules,
  };
}

function rule(
  id: string,
  impact: number,
  confidence: number,
  selector: CompatibilityFactSelector = {
    kind: "phase-one-pair",
    fact: "zodiac.signs",
    equal: false,
  },
): CompatibilityCategoryRule {
  return {
    id,
    categoryId: "connection",
    selector,
    impact,
    confidence,
    rationale: `Fixture rationale for ${id}.`,
  };
}

function aggregate(): CompatibilityFactAggregate {
  return aggregateFor(
    chart("fixture-a", FIRST_LONGITUDES),
    chart("fixture-b", SECOND_LONGITUDES),
  );
}

function aggregateFor(
  first: NatalChart,
  second: NatalChart,
): CompatibilityFactAggregate {
  const firstSign = toZodiacPosition(
    first.placements[0]!.eclipticLongitudeDegrees,
  ).sign;
  const secondSign = toZodiacPosition(
    second.placements[0]!.eclipticLongitudeDegrees,
  ).sign;
  return composeCompatibilityFacts({
    phaseOne: phaseOne(firstSign, secondSign),
    synastry: new SynastryAspectEngine().calculate(first, second),
    houseOverlays: new HouseOverlayEngine().calculate(first, second),
  });
}

function phaseOne(firstSign: ZodiacSign, secondSign: ZodiacSign) {
  return new PhaseOneCompatibilityStrategy().compare({
    first: {
      zodiacSign: firstSign,
      lifePath: numerology(11),
      expression: numerology(5),
    },
    second: {
      zodiacSign: secondSign,
      lifePath: numerology(7),
      expression: numerology(3),
    },
  });
}

function numerology(value: number): NumerologyResult {
  return {
    value,
    masterNumber: [11, 22, 33].includes(value),
    tokens: [{ source: "private-source-marker", normalized: "PRIVATE", value }],
    trace: [{ operation: "fixture-reduction", inputs: [value], result: value }],
    strategyId: "pythagorean",
    strategyVersion: "1.0.0",
  };
}

function chart(providerId: string, longitudes: readonly number[]): NatalChart {
  const result = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
  result.input.timezoneSource = "private scoring timezone source";
  result.input.coordinateSource = "private scoring coordinate source";
  result.metadata.positionProvider.providerId = providerId;
  result.metadata.positionProvider.providerVersion = "fixture-1.0.0";
  result.metadata.positionProvider.dataVersion = "fixture-data-1.0.0";
  result.placements = result.placements.map((placement, index) => {
    const longitude = longitudes[index]!;
    return {
      ...placement,
      eclipticLongitudeDegrees: longitude,
      speedLongitudeDegreesPerDay: index + 1,
      zodiac: toZodiacPosition(longitude),
      houseNumber: findHouseNumber(
        longitude,
        result.houses.cuspsLongitudeDegrees,
      ),
    };
  });
  result.aspects = calculateNatalAspects(
    result.placements,
    result.metadata.aspectPolicy.definitions,
  );
  return result;
}

interface MutableCategory extends Omit<
  CompatibilityCategoryDefinition,
  "minimum" | "maximum"
> {
  minimum: number;
  maximum: number;
}

interface MutableRule extends Omit<
  CompatibilityCategoryRule,
  "categoryId" | "selector" | "rationale"
> {
  categoryId: string;
  selector: CompatibilityFactSelector;
  rationale: string;
}

interface MutablePolicy extends Omit<
  CompatibilityCategoryPolicy,
  "categories" | "rules"
> {
  categories: MutableCategory[];
  rules: MutableRule[];
}

type MutableAggregate = CompatibilityFactAggregate & { version: string };
