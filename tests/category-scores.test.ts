import { describe, expect, it } from "vitest";

import {
  CATEGORY_SCORE_FORMULA_VERSION,
  calculatePersonalCategoryScores,
} from "@/application/calculate-category-scores";
import type { PersonalContextFacts } from "@/application/compose-personal-context";
import { DEFAULT_CATEGORY_SCORE_MODEL } from "@/config/category-model";
import type { CategoryScoreModel } from "@/domain/category/contracts";

describe("explainable category scores", () => {
  it("derives bounded scores with reconstructable source contributions", () => {
    const output = calculatePersonalCategoryScores(contextFixture());
    expect(output.metadata).toEqual({
      label: "interpretive product heuristic; not a scientific measurement",
      modelId: "personal-category-baseline",
      modelVersion: "1.0.0",
      formulaVersion: CATEGORY_SCORE_FORMULA_VERSION,
      contextVersion: "1.0.0",
      projectionVersion: "1.0.0",
      scoreFormula: "clamp(round(baseline + sum(impact)), 0, 100)",
      confidenceFormula: "weighted mean by absolute impact; 0 without factors",
    });
    expect(score(output, "love")).toMatchObject({
      label: "interpretive product heuristic",
      baseline: 50,
      contributionTotal: 8,
      rawScore: 58,
      score: 58,
      confidence: 0.65,
      sourceFactIds: ["transit:venus:body:sun:trine"],
    });
    expect(score(output, "love").contributingFactors).toEqual([
      {
        ruleId: "venus-love",
        sourceFactId: "transit:venus:body:sun:trine",
        projectionKey: "transit.venus.trine.natal.sun",
        impact: 8,
        confidence: 0.65,
        rationale: "Configured venus love contribution.",
      },
    ]);
    expect(score(output, "opportunity").score).toBe(56);
    expect(score(output, "energy").score).toBe(54);
    expect(score(output, "personal-growth").score).toBe(61);
    expect(score(output, "finance")).toMatchObject({
      baseline: 50,
      contributionTotal: 0,
      rawScore: 50,
      score: 50,
      confidence: 0,
      sourceFactIds: [],
      contributingFactors: [],
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(score(output, "love").contributingFactors)).toBe(
      true,
    );
  });

  it("applies the declared weighted confidence formula and clamps final scores", () => {
    const positive = calculatePersonalCategoryScores(
      contextFixture(),
      model({
        baseline: 95,
        rules: [rule("positive-a", 20, 0.25), rule("positive-b", 10, 1)],
      }),
    );
    expect(score(positive, "love")).toMatchObject({
      contributionTotal: 30,
      rawScore: 125,
      score: 100,
      confidence: 0.5,
    });

    const negative = calculatePersonalCategoryScores(
      contextFixture(),
      model({ baseline: 5, rules: [rule("negative", -20, 0.5)] }),
    );
    expect(score(negative, "love")).toMatchObject({
      contributionTotal: -20,
      rawScore: -15,
      score: 0,
      confidence: 0.5,
    });
  });

  it("is deterministic and leaves context and default configuration unchanged", () => {
    const context = contextFixture();
    const contextBefore = structuredClone(context);
    const modelBefore = structuredClone(DEFAULT_CATEGORY_SCORE_MODEL);
    expect(calculatePersonalCategoryScores(context)).toEqual(
      calculatePersonalCategoryScores(context),
    );
    expect(context).toEqual(contextBefore);
    expect(DEFAULT_CATEGORY_SCORE_MODEL).toEqual(modelBefore);
    expect(Object.isFrozen(DEFAULT_CATEGORY_SCORE_MODEL)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CATEGORY_SCORE_MODEL.rules)).toBe(true);
  });

  it.each([
    model({ baseline: Number.NaN }),
    model({ baseline: -1 }),
    model({ baseline: 101 }),
  ])("rejects invalid baselines", (invalid) => {
    expect(() =>
      calculatePersonalCategoryScores(contextFixture(), invalid),
    ).toThrow("baseline");
  });

  it("rejects duplicate or unsupported categories and duplicate rules", () => {
    expect(() =>
      calculatePersonalCategoryScores(
        contextFixture(),
        model({ categories: ["love", "love"] }),
      ),
    ).toThrow("categories are invalid");

    const unsupported = model() as MutableModel;
    unsupported.categories = ["unknown"];
    expect(() =>
      calculatePersonalCategoryScores(
        contextFixture(),
        unsupported as unknown as CategoryScoreModel,
      ),
    ).toThrow("categories are invalid");

    expect(() =>
      calculatePersonalCategoryScores(
        contextFixture(),
        model({ rules: [rule("duplicate", 1), rule("duplicate", 2)] }),
      ),
    ).toThrow("IDs must be unique");
  });

  it.each([
    rule("nan-impact", Number.NaN),
    rule("large-impact", 101),
    rule("low-confidence", 1, -0.1),
    rule("high-confidence", 1, 1.1),
  ])("rejects invalid rule weights for $id", (invalidRule) => {
    expect(() =>
      calculatePersonalCategoryScores(
        contextFixture(),
        model({ rules: [invalidRule] }),
      ),
    ).toThrow("invalid weights");
  });

  it("rejects unknown categories, empty selectors, and unsafe rule text", () => {
    const unknownCategory = rule("unknown-category", 1);
    (unknownCategory as unknown as { category: string }).category = "career";
    expect(() =>
      calculatePersonalCategoryScores(
        contextFixture(),
        model({ rules: [unknownCategory] }),
      ),
    ).toThrow("unknown category");

    const emptySelector = rule("empty-selector", 1);
    (
      emptySelector as unknown as {
        parameterMatches: Record<string, unknown>;
      }
    ).parameterMatches = {};
    expect(() =>
      calculatePersonalCategoryScores(
        contextFixture(),
        model({ rules: [emptySelector] }),
      ),
    ).toThrow("declare a selector");

    const unsafe = rule("unsafe", 1);
    (unsafe as unknown as { rationale: string }).rationale = "<script>";
    expect(() =>
      calculatePersonalCategoryScores(
        contextFixture(),
        model({ rules: [unsafe] }),
      ),
    ).toThrow("safe plain text");

    const unknownSelector = rule("unknown-selector", 1);
    (
      unknownSelector as unknown as {
        parameterMatches: Record<string, unknown>;
      }
    ).parameterMatches = { typoBody: "venus" };
    expect(() =>
      calculatePersonalCategoryScores(
        contextFixture(),
        model({ rules: [unknownSelector] }),
      ),
    ).toThrow("invalid selector");
  });

  it("rejects unknown, missing, or duplicated fact references", () => {
    const context = contextFixture() as MutableContext;
    context.facts[0] = { ...context.facts[0]!, id: "unknown:fact" };
    expect(() => calculatePersonalCategoryScores(context)).toThrow(
      "cover every context fact",
    );

    const missing = contextFixture() as MutableContext;
    missing.facts = missing.facts.slice(1);
    expect(() => calculatePersonalCategoryScores(missing)).toThrow(
      "cover every context fact",
    );

    const duplicate = contextFixture() as MutableContext;
    duplicate.transits.aspects[1] = duplicate.transits.aspects[0]!;
    duplicate.facts = [
      duplicate.facts[0]!,
      duplicate.facts[0]!,
      ...duplicate.facts.slice(1),
    ];
    expect(() => calculatePersonalCategoryScores(duplicate)).toThrow(
      "projection keys must be unique",
    );
  });
});

type Output = ReturnType<typeof calculatePersonalCategoryScores>;
type MutableModel = Omit<CategoryScoreModel, "categories"> & {
  categories: string[];
};
type MutableContext = PersonalContextFacts & {
  facts: PersonalContextFacts["facts"][number][];
  transits: PersonalContextFacts["transits"] & {
    aspects: PersonalContextFacts["transits"]["aspects"][number][];
  };
};

function score(output: Output, category: Output["scores"][number]["category"]) {
  const result = output.scores.find((item) => item.category === category);
  if (!result) throw new Error(`Missing category ${category}`);
  return result;
}

function model(override: Partial<CategoryScoreModel> = {}): CategoryScoreModel {
  return {
    id: "test-category-model",
    version: "1.0.0",
    baseline: 50,
    categories: ["love"],
    rules: [rule("test-love", 5)],
    ...override,
  };
}

function rule(
  id: string,
  impact: number,
  confidence = 0.5,
): CategoryScoreModel["rules"][number] {
  return {
    id,
    category: "love",
    templateKey: "transit-aspect",
    parameterMatches: { transitingBody: "venus" },
    impact,
    confidence,
    rationale: `Configured rule ${id}.`,
  };
}

function contextFixture(): PersonalContextFacts {
  return {
    effectiveAt: "2000-01-01T02:00:00Z",
    localDate: "1999-12-31",
    timezone: "America/Toronto",
    natal: { placements: [], aspects: [] },
    transits: {
      aspects: [
        {
          transitingBody: "venus",
          type: "trine",
          natalTarget: { id: "body:sun", kind: "body", body: "sun" },
          orbDegrees: 0.5,
          phase: "applying",
        },
      ],
    },
    lunar: {
      phase: {
        phase: "waxing-crescent",
        moonZodiac: { sign: "taurus" },
        phaseAngleDegrees: 45,
        approximateIlluminatedFraction: 0.146447,
      },
      natalAspects: [],
    },
    numerology: {
      effectiveDate: "1999-12-31",
      results: {
        "personal-year": numerologyResult(9),
        "personal-day": numerologyResult(3),
      },
    },
    facts: [
      { id: "transit:venus:body:sun:trine", kind: "transit-aspect" },
      { id: "lunar:phase:waxing-crescent", kind: "lunar-phase" },
      { id: "numerology:personal-year", kind: "numerology" },
      { id: "numerology:personal-day", kind: "numerology" },
    ],
    metadata: {
      contextVersion: "1.0.0",
      composedAt: "2000-01-01T02:00:01Z",
      numerologyStrategy: { id: "pythagorean", version: "1.0.0" },
    },
  } as unknown as PersonalContextFacts;
}

function numerologyResult(value: number) {
  return {
    value,
    masterNumber: false,
    strategyId: "pythagorean",
    strategyVersion: "1.0.0",
  };
}
