import { describe, expect, it } from "vitest";

import {
  calculateNatalAspects,
  type NatalChart,
} from "@/application/calculate-natal-chart";
import {
  COMPATIBILITY_REPORT_DISCLAIMER,
  COMPATIBILITY_REPORT_VERSION,
  InvalidCompatibilityReportInputError,
  composeCompatibilityReport,
  type CompatibilityReportInput,
} from "@/application/compose-compatibility-report";
import {
  COMPATIBILITY_CATEGORY_SCORE_DISCLAIMER,
  COMPATIBILITY_CATEGORY_SCORE_FORMULA_VERSION,
  COMPATIBILITY_CATEGORY_SCORE_RESULT_VERSION,
  calculateCompatibilityCategoryScores,
  InvalidCompatibilityScoringInputError,
} from "@/application/calculate-compatibility-category-scores";
import { HouseOverlayEngine } from "@/application/calculate-house-overlays";
import {
  COMPATIBILITY_CONTENT_DISCLAIMER,
  COMPATIBILITY_CONTENT_PROJECTION_VERSION,
  InvalidCompatibilityContentInputError,
  projectCompatibilityContent,
  validateCompatibilityContentProjection,
  type CompatibilityContentProjection,
} from "@/application/project-compatibility-content";
import {
  COMPATIBILITY_CONTENT_RENDERER_VERSION,
  InvalidCompatibilityRenderInputError,
  UNSUPPORTED_COMPATIBILITY_CONTENT_FALLBACK,
  renderCompatibilityContent,
} from "@/application/render-compatibility-content";
import {
  composeCompatibilityFacts,
  type CompatibilityFactAggregate,
} from "@/application/compose-compatibility-facts";
import { SynastryAspectEngine } from "@/application/calculate-synastry-aspects";
import { findHouseNumber } from "@/domain/astro/house-strategies";
import { toZodiacPosition, type ZodiacSign } from "@/domain/astro/zodiac";
import { INITIAL_COMPATIBILITY_CATEGORY_POLICY } from "@/config/compatibility-category-policy";
import {
  COMPATIBILITY_CONTENT_LIBRARY_ID,
  COMPATIBILITY_CONTENT_LIBRARY_VERSION,
  DEFAULT_COMPATIBILITY_CONTENT_LIBRARY,
  DeterministicCompatibilityContentLibrary,
  type CompatibilityContentLibrary,
  type CompatibilityContentTemplate,
} from "@/domain/compatibility/content-library";
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
  it("composes one immutable, fully accounted compatibility report", () => {
    const input = reportInput();
    const report = composeCompatibilityReport(input);
    expect(report).toMatchObject({
      version: COMPATIBILITY_REPORT_VERSION,
      sourceVersions: {
        aggregate: "1.0.0",
        phaseOne: "1.0.0",
        synastry: "1.0.0",
        houseOverlays: "1.0.0",
        scoringResult: "1.0.0",
        scoringFormula: "1.0.0",
        scoringPolicy: "1.0.0",
        projection: "1.0.0",
        renderer: "1.0.0",
        contentLibrary: "1.0.0",
        locale: "en-CA",
      },
      accounting: {
        categories: 5,
        contributions: 12,
        projectionItems: 12,
        renderedFactSections: 12,
        renderedReflectionSections: 12,
        unsupportedFactSections: 0,
        unsupportedReflectionSections: 0,
      },
      disclaimer: COMPATIBILITY_REPORT_DISCLAIMER,
    });
    expect(report.aggregate).toEqual(input.aggregate);
    expect(report.scores).toEqual(input.scores);
    expect(report.projection).toEqual(input.projection);
    expect(report.rendered).toEqual(input.rendered);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.accounting)).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(
      /birth|observer|timezone|coordinateSource|private-source-marker|accountId|profileId|should marry|guaranteed/,
    );
  });

  it("accounts for independently unsupported fact and reflection sections", () => {
    const library = new DeterministicCompatibilityContentLibrary({
      id: "empty-report-library",
      version: "1.0.0",
      locale: "en-CA",
      templates: [],
    });
    const input = reportInput(library);
    const report = composeCompatibilityReport(input, { library });
    expect(report.accounting).toMatchObject({
      projectionItems: 12,
      renderedFactSections: 0,
      renderedReflectionSections: 0,
      unsupportedFactSections: 12,
      unsupportedReflectionSections: 12,
    });
    expect(report.sourceVersions.contentLibrary).toBe("1.0.0");
  });

  it("composes byte-equivalent reports when relationship inputs reverse", () => {
    const first = chart("fixture-a", FIRST_LONGITUDES);
    const second = chart("fixture-b", SECOND_LONGITUDES);
    const forward = composeCompatibilityReport(
      reportInput(undefined, aggregateFor(first, second)),
    );
    const reversed = composeCompatibilityReport(
      reportInput(undefined, aggregateFor(second, first)),
    );
    expect(reversed).toEqual(forward);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it.each([
    [
      "aggregate version drift",
      (input: CompatibilityReportInput) => {
        (input.aggregate as unknown as { version: string }).version = "2.0.0";
      },
    ],
    [
      "score reorder",
      (input: CompatibilityReportInput) => {
        (input.scores.categories as unknown as unknown[]).reverse();
      },
    ],
    [
      "projection loss",
      (input: CompatibilityReportInput) => {
        (input.projection.items as unknown as unknown[]).pop();
      },
    ],
    [
      "rendered reorder",
      (input: CompatibilityReportInput) => {
        (input.rendered.items as unknown as unknown[]).reverse();
      },
    ],
    [
      "rendered text drift",
      (input: CompatibilityReportInput) => {
        const fact = input.rendered.items[0]!.fact as unknown as {
          text: string;
        };
        fact.text = "Calculated replacement text.";
      },
    ],
    [
      "rendered provenance drift",
      (input: CompatibilityReportInput) => {
        const provenance = input.rendered.items[0]!.fact
          .provenance as unknown as {
          sourceFactId: string;
        };
        provenance.sourceFactId = "unknown";
      },
    ],
    [
      "claims disclaimer drift",
      (input: CompatibilityReportInput) => {
        (input.rendered as unknown as { disclaimer: string }).disclaimer =
          "This relationship is guaranteed.";
      },
    ],
  ])("rejects incompatible report child: %s", (_, corrupt) => {
    const input = structuredClone(reportInput());
    corrupt(input);
    expect(() => composeCompatibilityReport(input)).toThrow(
      InvalidCompatibilityReportInputError,
    );
    expect(() => composeCompatibilityReport(input)).toThrow(
      "Compatibility report input is invalid or inconsistent",
    );
  });

  it("covers every factual and category-tone key in the default en-CA library", () => {
    const keys = [
      "compatibility.fact.phase-one-pair",
      "compatibility.fact.phase-one-numerology-pair",
      "compatibility.fact.synastry-aspect",
      "compatibility.fact.house-overlay",
      ...[
        "attraction",
        "communication",
        "emotional",
        "long-term",
        "chemistry",
      ].flatMap((category) =>
        ["supportive", "challenging", "neutral"].map(
          (tone) => `compatibility.reflection.${category}.${tone}`,
        ),
      ),
    ];
    expect(DEFAULT_COMPATIBILITY_CONTENT_LIBRARY.id).toBe(
      COMPATIBILITY_CONTENT_LIBRARY_ID,
    );
    expect(DEFAULT_COMPATIBILITY_CONTENT_LIBRARY.version).toBe(
      COMPATIBILITY_CONTENT_LIBRARY_VERSION,
    );
    expect(DEFAULT_COMPATIBILITY_CONTENT_LIBRARY.locale).toBe("en-CA");
    expect(
      keys.every(
        (key) => DEFAULT_COMPATIBILITY_CONTENT_LIBRARY.resolve(key).supported,
      ),
    ).toBe(true);
    expect(DEFAULT_COMPATIBILITY_CONTENT_LIBRARY.resolve("unknown")).toEqual({
      supported: false,
      key: "unknown",
      reason: "unsupported-key",
    });
  });

  it("renders separate exact fact and tradition-framed reflection sections", () => {
    const source = aggregate();
    const scores = calculateCompatibilityCategoryScores(
      source,
      INITIAL_COMPATIBILITY_CATEGORY_POLICY,
    );
    const projection = projectCompatibilityContent(source, scores);
    const rendered = renderCompatibilityContent(projection, source, scores);

    expect(rendered).toMatchObject({
      version: COMPATIBILITY_CONTENT_RENDERER_VERSION,
      renderingMode: "deterministic-template",
      disclaimer: COMPATIBILITY_CONTENT_DISCLAIMER,
    });
    expect(rendered.items).toHaveLength(projection.items.length);
    expect(rendered.items[0]).toMatchObject({
      id: projection.items[0]!.id,
      categoryId: "attraction",
      tone: "supportive",
      fact: {
        status: "rendered",
        text: "Calculated cross-chart aspect: Sun is Trine Venus, with orb 1 degrees, phase Applying, and normalized strength 0.857143.",
        provenance: {
          sourceFactId: "synastry:chart-a:sun:chart-b:venus:trine",
          ruleId: "attraction-sun-venus-trine",
          factKey: "compatibility.fact.synastry-aspect",
          reflectionKey: "compatibility.reflection.attraction.supportive",
          projectionVersion: "1.0.0",
          aggregateVersion: "1.0.0",
          scoringResultVersion: "1.0.0",
          scoringFormulaVersion: "1.0.0",
          scoringPolicyVersion: "1.0.0",
          libraryId: COMPATIBILITY_CONTENT_LIBRARY_ID,
          libraryVersion: COMPATIBILITY_CONTENT_LIBRARY_VERSION,
          locale: "en-CA",
          rendererVersion: COMPATIBILITY_CONTENT_RENDERER_VERSION,
        },
      },
      reflection: {
        status: "rendered",
        text: "Within astrology and numerology traditions, this configured Attraction factor is a Supportive reflection prompt; product impact is 4 with confidence 0.55.",
      },
    });
    expect(rendered.items[0]!.fact).not.toBe(rendered.items[0]!.reflection);
    expect(Object.isFrozen(rendered)).toBe(true);
    expect(Object.isFrozen(rendered.items[0]!.fact.provenance)).toBe(true);
    expect(JSON.stringify(rendered)).not.toMatch(
      /birth|observer|timezone|coordinateSource|private-source-marker|soulmate|guaranteed|should marry/,
    );
  });

  it("renders byte-equivalent sections when relationship inputs reverse", () => {
    const first = chart("fixture-a", FIRST_LONGITUDES);
    const second = chart("fixture-b", SECOND_LONGITUDES);
    const render = (source: CompatibilityFactAggregate) => {
      const scores = calculateCompatibilityCategoryScores(
        source,
        INITIAL_COMPATIBILITY_CATEGORY_POLICY,
      );
      return renderCompatibilityContent(
        projectCompatibilityContent(source, scores),
        source,
        scores,
      );
    };
    const forward = render(aggregateFor(first, second));
    const reversed = render(aggregateFor(second, first));
    expect(reversed).toEqual(forward);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it("uses fixed provenance-bearing fallbacks for unsupported keys", () => {
    const source = aggregate();
    const scores = calculateCompatibilityCategoryScores(
      source,
      INITIAL_COMPATIBILITY_CATEGORY_POLICY,
    );
    const projection = projectCompatibilityContent(source, scores);
    const emptyLibrary = new DeterministicCompatibilityContentLibrary({
      id: "empty-compatibility-library",
      version: "1.0.0",
      locale: "en-CA",
      templates: [],
    });
    const rendered = renderCompatibilityContent(
      projection,
      source,
      scores,
      emptyLibrary,
    );
    expect(rendered.items[0]!.fact).toMatchObject({
      status: "unsupported",
      reason: "unsupported-key",
      text: UNSUPPORTED_COMPATIBILITY_CONTENT_FALLBACK,
      provenance: { libraryId: "empty-compatibility-library" },
    });
    expect(rendered.items[0]!.reflection).toMatchObject({
      status: "unsupported",
      text: UNSUPPORTED_COMPATIBILITY_CONTENT_FALLBACK,
    });
  });

  it.each([
    [
      "interpretive fact",
      (template: MutableCompatibilityTemplate) => {
        template.text =
          "Calculated {fact} values {firstValue} and {secondValue}, equality {equal}, means compatibility.";
      },
    ],
    [
      "unsafe reflection",
      (template: MutableCompatibilityTemplate) => {
        template.text =
          "Within astrology and numerology traditions, this {categoryId} {tone} factor guarantees a soulmate with impact {impact} and confidence {confidence}.";
      },
    ],
    [
      "unknown placeholder",
      (template: MutableCompatibilityTemplate) => {
        template.text =
          "Calculated {fact} values are {firstValue} and {secondValue}; equality is {unknown}.";
      },
    ],
  ])("rejects unsafe or malformed template: %s", (kind, corrupt) => {
    const key =
      kind === "unsafe reflection"
        ? "compatibility.reflection.attraction.supportive"
        : "compatibility.fact.phase-one-pair";
    const resolution = DEFAULT_COMPATIBILITY_CONTENT_LIBRARY.resolve(key);
    expect(resolution.supported).toBe(true);
    if (!resolution.supported) throw new Error("fixture template missing");
    const template = structuredClone(
      resolution.template,
    ) as MutableCompatibilityTemplate;
    corrupt(template);
    expect(
      () =>
        new DeterministicCompatibilityContentLibrary({
          id: "invalid-test-library",
          version: "1.0.0",
          locale: "en-CA",
          templates: [template as CompatibilityContentTemplate],
        }),
    ).toThrow();
  });

  it("rejects mismatched library responses and drifted projections generically", () => {
    const source = aggregate();
    const scores = calculateCompatibilityCategoryScores(
      source,
      INITIAL_COMPATIBILITY_CATEGORY_POLICY,
    );
    const projection = projectCompatibilityContent(source, scores);
    const mismatchedLibrary = {
      id: "mismatched-library",
      version: "1.0.0",
      locale: "en-CA",
      resolve: () => ({
        supported: false as const,
        key: "different-key",
        reason: "unsupported-key" as const,
      }),
    };
    expect(() =>
      renderCompatibilityContent(projection, source, scores, mismatchedLibrary),
    ).toThrow(InvalidCompatibilityRenderInputError);

    const drifted = structuredClone(projection);
    (drifted as unknown as { version: string }).version = "2.0.0";
    expect(() => renderCompatibilityContent(drifted, source, scores)).toThrow(
      InvalidCompatibilityRenderInputError,
    );
  });

  it("projects every selected contribution once into factual and reflection keys", () => {
    const source = aggregate();
    const scores = calculateCompatibilityCategoryScores(
      source,
      INITIAL_COMPATIBILITY_CATEGORY_POLICY,
    );
    const projection = projectCompatibilityContent(source, scores);
    const contributions = scores.categories.flatMap(
      (category) => category.contributions,
    );

    expect(projection).toMatchObject({
      version: COMPATIBILITY_CONTENT_PROJECTION_VERSION,
      sourceVersions: {
        aggregate: "1.0.0",
        phaseOne: "1.0.0",
        synastry: "1.0.0",
        houseOverlays: "1.0.0",
        scoringResult: "1.0.0",
        scoringFormula: "1.0.0",
        scoringPolicy: "1.0.0",
      },
      disclaimer: COMPATIBILITY_CONTENT_DISCLAIMER,
    });
    expect(projection.items).toHaveLength(contributions.length);
    expect(projection.items).toHaveLength(12);
    expect(
      projection.items.map((item) => [item.ruleId, item.sourceFactId]),
    ).toEqual(
      contributions.map((contribution) => [
        contribution.ruleId,
        contribution.sourceFactId,
      ]),
    );
    expect(projection.items[0]).toMatchObject({
      categoryId: "attraction",
      ruleId: "attraction-sun-venus-trine",
      sourceFactId: "synastry:chart-a:sun:chart-b:venus:trine",
      factKey: "compatibility.fact.synastry-aspect",
      reflectionKey: "compatibility.reflection.attraction.supportive",
      tone: "supportive",
      impact: 4,
      confidence: 0.55,
      parameters: {
        firstBody: "sun",
        secondBody: "venus",
        aspectType: "trine",
        phase: "applying",
        normalizedStrength: 0.8571428571428572,
      },
    });
    expect(
      projection.items.find(
        (item) => item.ruleId === "communication-mercury-mercury-opposition",
      ),
    ).toMatchObject({
      reflectionKey: "compatibility.reflection.communication.challenging",
      tone: "challenging",
      impact: -2,
    });
    expect(new Set(projection.items.map((item) => item.id)).size).toBe(
      projection.items.length,
    );
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.items[0]!.parameters)).toBe(true);
    expect(JSON.stringify(projection)).not.toMatch(
      /birth|observer|timezone|coordinateSource|private-source-marker|rationale|name|account|profile/,
    );
  });

  it("projects byte-equivalent content when relationship inputs reverse", () => {
    const first = chart("fixture-a", FIRST_LONGITUDES);
    const second = chart("fixture-b", SECOND_LONGITUDES);
    const forwardAggregate = aggregateFor(first, second);
    const reversedAggregate = aggregateFor(second, first);
    const forward = projectCompatibilityContent(
      forwardAggregate,
      calculateCompatibilityCategoryScores(
        forwardAggregate,
        INITIAL_COMPATIBILITY_CATEGORY_POLICY,
      ),
    );
    const reversed = projectCompatibilityContent(
      reversedAggregate,
      calculateCompatibilityCategoryScores(
        reversedAggregate,
        INITIAL_COMPATIBILITY_CATEGORY_POLICY,
      ),
    );
    expect(reversed).toEqual(forward);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it.each([
    [
      "version drift",
      (value: MutableProjection) => {
        value.version = "2.0.0";
      },
    ],
    [
      "missing item",
      (value: MutableProjection) => {
        value.items.pop();
      },
    ],
    [
      "duplicate item",
      (value: MutableProjection) => {
        value.items[1] = structuredClone(value.items[0]!);
      },
    ],
    [
      "reordered items",
      (value: MutableProjection) => {
        value.items.reverse();
      },
    ],
    [
      "unknown source",
      (value: MutableProjection) => {
        value.items[0]!.sourceFactId = "compatibility:unknown";
      },
    ],
    [
      "unsupported fact key",
      (value: MutableProjection) => {
        value.items[0]!.factKey = "compatibility.fact.unsupported";
      },
    ],
    [
      "unsupported reflection key",
      (value: MutableProjection) => {
        value.items[0]!.reflectionKey =
          "compatibility.reflection.attraction.guaranteed";
      },
    ],
    [
      "unsafe claims drift",
      (value: MutableProjection) => {
        value.disclaimer = "This relationship is guaranteed to succeed.";
      },
    ],
  ])("rejects projected content corruption: %s", (_, corrupt) => {
    const source = aggregate();
    const scores = calculateCompatibilityCategoryScores(
      source,
      INITIAL_COMPATIBILITY_CATEGORY_POLICY,
    );
    const projection = structuredClone(
      projectCompatibilityContent(source, scores),
    ) as unknown as MutableProjection;
    corrupt(projection);
    expect(() =>
      validateCompatibilityContentProjection(
        projection as unknown as CompatibilityContentProjection,
        source,
        scores,
      ),
    ).toThrow(InvalidCompatibilityContentInputError);
  });

  it("rejects score drift and policies outside the accepted Goal 37 version", () => {
    const source = aggregate();
    const scores = calculateCompatibilityCategoryScores(
      source,
      INITIAL_COMPATIBILITY_CATEGORY_POLICY,
    );
    const driftedScores = structuredClone(scores);
    (
      driftedScores.categories[0]!.contributions[0] as unknown as {
        impact: number;
      }
    ).impact = 99;
    expect(() => projectCompatibilityContent(source, driftedScores)).toThrow(
      InvalidCompatibilityContentInputError,
    );

    const unsupportedPolicy = structuredClone(
      INITIAL_COMPATIBILITY_CATEGORY_POLICY,
    );
    (unsupportedPolicy as unknown as { version: string }).version = "2.0.0";
    const unsupportedScores = calculateCompatibilityCategoryScores(
      source,
      unsupportedPolicy,
    );
    expect(() =>
      projectCompatibilityContent(source, unsupportedScores, unsupportedPolicy),
    ).toThrow(InvalidCompatibilityContentInputError);
  });

  it("validates the frozen initial five-category policy with conservative complete rules", () => {
    const policy = INITIAL_COMPATIBILITY_CATEGORY_POLICY;
    expect(policy.categories.map((category) => category.id)).toEqual([
      "attraction",
      "communication",
      "emotional",
      "long-term",
      "chemistry",
    ]);
    expect(new Set(policy.rules.map((rule) => rule.id)).size).toBe(
      policy.rules.length,
    );
    for (const category of policy.categories) {
      const rules = policy.rules.filter(
        (rule) => rule.categoryId === category.id,
      );
      expect(rules.length).toBeGreaterThan(0);
      expect(
        rules.some((rule) => rule.selector.kind === "phase-one-pair"),
      ).toBe(true);
      expect(
        rules.some((rule) => rule.selector.kind === "synastry-aspect"),
      ).toBe(true);
      expect(rules.some((rule) => rule.selector.kind === "house-overlay")).toBe(
        true,
      );
    }
    expect(policy.rules.every((rule) => Math.abs(rule.impact) <= 4)).toBe(true);
    expect(
      policy.rules.every((rule) =>
        rule.rationale.startsWith("Tradition-framed configured contribution"),
      ),
    ).toBe(true);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.rules)).toBe(true);
  });

  it("scores the initial policy stably without mutating its aggregate", () => {
    const source = aggregate();
    const before = JSON.stringify(source);
    const first = calculateCompatibilityCategoryScores(
      source,
      INITIAL_COMPATIBILITY_CATEGORY_POLICY,
    );
    const second = calculateCompatibilityCategoryScores(
      source,
      INITIAL_COMPATIBILITY_CATEGORY_POLICY,
    );
    expect(second).toEqual(first);
    expect(first.categories.map((category) => category.categoryId)).toEqual([
      "attraction",
      "communication",
      "emotional",
      "long-term",
      "chemistry",
    ]);
    expect(first.categories.every((category) => category.score >= 0)).toBe(
      true,
    );
    expect(first.categories.every((category) => category.score <= 100)).toBe(
      true,
    );
    expect(
      first.categories.map((category) => ({
        id: category.categoryId,
        score: category.score,
        contributionTotal: category.contributionTotal,
        confidence: category.confidence,
        factors: category.contributions.length,
      })),
    ).toEqual([
      {
        id: "attraction",
        score: 60,
        contributionTotal: 10,
        confidence: 0.54,
        factors: 3,
      },
      {
        id: "communication",
        score: 48,
        contributionTotal: -2,
        confidence: 0.55,
        factors: 1,
      },
      {
        id: "emotional",
        score: 50,
        contributionTotal: 0,
        confidence: 0.525,
        factors: 2,
      },
      {
        id: "long-term",
        score: 52,
        contributionTotal: 2,
        confidence: 0.55,
        factors: 1,
      },
      {
        id: "chemistry",
        score: 66,
        contributionTotal: 16,
        confidence: 0.54375,
        factors: 5,
      },
    ]);
    const alternative = structuredClone(INITIAL_COMPATIBILITY_CATEGORY_POLICY);
    (alternative as unknown as { version: string }).version = "1.0.1-test";
    (alternative.rules[0] as unknown as { impact: number }).impact = 2;
    const alternativeResult = calculateCompatibilityCategoryScores(
      source,
      alternative,
    );
    expect(alternativeResult.policy.version).toBe("1.0.1-test");
    expect(alternativeResult).not.toEqual(first);
    expect(JSON.stringify(source)).toBe(before);
  });

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

function reportInput(
  library: CompatibilityContentLibrary = DEFAULT_COMPATIBILITY_CONTENT_LIBRARY,
  source: CompatibilityFactAggregate = aggregate(),
): CompatibilityReportInput {
  const scores = calculateCompatibilityCategoryScores(
    source,
    INITIAL_COMPATIBILITY_CATEGORY_POLICY,
  );
  const projection = projectCompatibilityContent(source, scores);
  const rendered = renderCompatibilityContent(
    projection,
    source,
    scores,
    library,
  );
  return { aggregate: source, scores, projection, rendered };
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

interface MutableProjectionItem extends Omit<
  CompatibilityContentProjection["items"][number],
  "sourceFactId" | "factKey" | "reflectionKey"
> {
  sourceFactId: string;
  factKey: string;
  reflectionKey: string;
}

interface MutableProjection extends Omit<
  CompatibilityContentProjection,
  "version" | "items" | "disclaimer"
> {
  version: string;
  items: MutableProjectionItem[];
  disclaimer: string;
}

interface MutableCompatibilityTemplate extends Omit<
  CompatibilityContentTemplate,
  "text"
> {
  text: string;
}
