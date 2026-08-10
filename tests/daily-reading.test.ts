import { describe, expect, it } from "vitest";

import {
  DAILY_READING_SIGNAL_LIMIT,
  DAILY_READING_VERSION,
  assembleDailyReading,
  composeDailyReading,
} from "@/application/compose-daily-reading";
import type { PersonalContextFacts } from "@/application/compose-personal-context";
import type { CategoryScoreModel } from "@/domain/category/contracts";

describe("daily reading composition", () => {
  it("composes one immutable versioned payload with complete fact coverage", () => {
    const context = contextFixture();
    const output = composeDailyReading(context);
    expect(output).toMatchObject({
      effectiveAt: context.effectiveAt,
      localDate: context.localDate,
      timezone: context.timezone,
      metadata: {
        readingVersion: DAILY_READING_VERSION,
        contextVersion: "1.0.0",
        projectionVersion: "1.0.0",
        libraryId: "personal-reflection-en-ca",
        libraryVersion: "1.0.0",
        locale: "en-CA",
        rendererVersion: "1.0.0",
        scoreModelId: "personal-category-baseline",
        scoreModelVersion: "1.0.0",
        scoreFormulaVersion: "1.0.0",
      },
    });
    expect(output.interpretations.items).toHaveLength(context.facts.length);
    expect(output.context).toBe(context);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.strongestSignals)).toBe(true);
  });

  it("selects at most five strongest existing contributions deterministically", () => {
    const output = composeDailyReading(contextFixture());
    expect(DAILY_READING_SIGNAL_LIMIT).toBe(5);
    expect(output.strongestSignals.map((signal) => signal.ruleId)).toEqual([
      "venus-love",
      "venus-relationships",
      "trine-opportunity",
      "personal-year-growth",
      "personal-day-growth",
    ]);
    expect(output.strongestSignals[0]).toMatchObject({
      category: "love",
      categoryScore: 58,
      impact: 8,
      sourceFactId: "transit:venus:body:sun:trine",
      projectionKey: "transit.venus.trine.natal.sun",
    });
    expect(output.metadata.signalOrdering).toBe(
      "absolute impact desc, confidence desc, category, source fact, rule",
    );
  });

  it("returns no strongest signals when no configured rule matches", () => {
    const model: CategoryScoreModel = {
      id: "no-match",
      version: "1.0.0",
      baseline: 50,
      categories: ["love"],
      rules: [
        {
          id: "mars-only",
          category: "love",
          templateKey: "transit-aspect",
          parameterMatches: { transitingBody: "mars" },
          impact: 10,
          confidence: 0.5,
          rationale: "Configured no-match fixture.",
        },
      ],
    };
    const output = composeDailyReading(contextFixture(), undefined, model);
    expect(output.strongestSignals).toEqual([]);
    expect(output.categories.scores[0]).toMatchObject({
      score: 50,
      confidence: 0,
      contributingFactors: [],
    });
  });

  it("fails closed on effective-time or fact-coverage mismatches", () => {
    const output = composeDailyReading(contextFixture());
    const wrongTime = structuredClone(output.categories);
    (wrongTime as unknown as { effectiveAt: string }).effectiveAt =
      "2000-01-02T02:00:00Z";
    expect(() =>
      assembleDailyReading(output.context, output.interpretations, wrongTime),
    ).toThrow("mismatched fact coverage");

    const missing = structuredClone(output.interpretations);
    (missing as unknown as { items: unknown[] }).items.pop();
    expect(() =>
      assembleDailyReading(output.context, missing, output.categories),
    ).toThrow("mismatched fact coverage");
  });

  it("fails closed on unknown category facts and version mismatches", () => {
    const output = composeDailyReading(contextFixture());
    const unknown = structuredClone(output.categories);
    const factor = unknown.scores
      .flatMap((score) => score.contributingFactors)
      .at(0)!;
    (factor as unknown as { sourceFactId: string }).sourceFactId =
      "unknown:fact";
    expect(() =>
      assembleDailyReading(output.context, output.interpretations, unknown),
    ).toThrow("unknown fact");

    const version = structuredClone(output.interpretations);
    const item = version.items[1]!;
    const provenance =
      item.status === "rendered"
        ? item.fact.provenance
        : item.fallback.provenance;
    (provenance as unknown as { libraryVersion: string }).libraryVersion =
      "2.0.0";
    expect(() =>
      assembleDailyReading(output.context, version, output.categories),
    ).toThrow("versions are inconsistent");
  });

  it("rejects duplicate contributions and split-section provenance", () => {
    const output = composeDailyReading(contextFixture());
    const duplicate = structuredClone(output.categories);
    const scored = duplicate.scores.find(
      (item) => item.contributingFactors.length > 0,
    )!;
    (
      scored as unknown as {
        contributingFactors: unknown[];
      }
    ).contributingFactors.push(scored.contributingFactors[0]!);
    expect(() =>
      assembleDailyReading(output.context, output.interpretations, duplicate),
    ).toThrow("contributions must be unique");

    const split = structuredClone(output.interpretations);
    const rendered = split.items.find((item) => item.status === "rendered")!;
    if (rendered.status !== "rendered") throw new Error("Expected rendering");
    (
      rendered.interpretation.provenance as unknown as {
        rendererVersion: string;
      }
    ).rendererVersion = "2.0.0";
    expect(() =>
      assembleDailyReading(output.context, split, output.categories),
    ).toThrow("versions are inconsistent");
  });
});

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
        "personal-year": result(9),
        "personal-day": result(3),
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

function result(value: number) {
  return {
    value,
    masterNumber: false,
    strategyId: "pythagorean",
    strategyVersion: "1.0.0",
  };
}
