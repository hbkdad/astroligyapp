import {
  calculateCompatibilityCategoryScores,
  type CompatibilityCategoryScoreResult,
} from "@/application/calculate-compatibility-category-scores";
import {
  composeCompatibilityFacts,
  type CompatibilityFactAggregate,
} from "@/application/compose-compatibility-facts";
import {
  projectCompatibilityContent,
  type CompatibilityContentProjection,
} from "@/application/project-compatibility-content";
import {
  renderCompatibilityContent,
  type RenderedCompatibilityContent,
} from "@/application/render-compatibility-content";
import { INITIAL_COMPATIBILITY_CATEGORY_POLICY } from "@/config/compatibility-category-policy";
import {
  DEFAULT_COMPATIBILITY_CONTENT_LIBRARY,
  type CompatibilityContentLibrary,
} from "@/domain/compatibility/content-library";
import type { CompatibilityCategoryPolicy } from "@/domain/compatibility/scoring";

export const COMPATIBILITY_REPORT_VERSION = "1.0.0";
export const COMPATIBILITY_REPORT_DISCLAIMER =
  "This report separates calculated relationship-comparison facts from non-scientific, tradition-framed product reflections; it is not a prediction or relationship advice.";

export interface CompatibilityReportInput {
  readonly aggregate: CompatibilityFactAggregate;
  readonly scores: CompatibilityCategoryScoreResult;
  readonly projection: CompatibilityContentProjection;
  readonly rendered: RenderedCompatibilityContent;
}

export interface CompatibilityReport {
  readonly version: string;
  readonly sourceVersions: Readonly<{
    aggregate: string;
    phaseOne: string;
    synastry: string;
    houseOverlays: string;
    scoringResult: string;
    scoringFormula: string;
    scoringPolicy: string;
    projection: string;
    renderer: string;
    contentLibrary: string;
    locale: string;
  }>;
  readonly aggregate: CompatibilityFactAggregate;
  readonly scores: CompatibilityCategoryScoreResult;
  readonly projection: CompatibilityContentProjection;
  readonly rendered: RenderedCompatibilityContent;
  readonly accounting: Readonly<{
    categories: number;
    contributions: number;
    projectionItems: number;
    renderedFactSections: number;
    renderedReflectionSections: number;
    unsupportedFactSections: number;
    unsupportedReflectionSections: number;
  }>;
  readonly disclaimer: string;
}

export class InvalidCompatibilityReportInputError extends Error {
  constructor() {
    super("Compatibility report input is invalid or inconsistent");
    this.name = "InvalidCompatibilityReportInputError";
  }
}

export function composeCompatibilityReport(
  input: CompatibilityReportInput,
  options: Readonly<{
    policy?: CompatibilityCategoryPolicy;
    library?: CompatibilityContentLibrary;
  }> = {},
): CompatibilityReport {
  try {
    const policy = options.policy ?? INITIAL_COMPATIBILITY_CATEGORY_POLICY;
    const library = options.library ?? DEFAULT_COMPATIBILITY_CONTENT_LIBRARY;
    const expectedAggregate = composeCompatibilityFacts({
      phaseOne: input.aggregate.phaseOne,
      synastry: input.aggregate.synastry,
      houseOverlays: input.aggregate.houseOverlays,
    });
    if (!sameValue(input.aggregate, expectedAggregate)) invalid();
    const expectedScores = calculateCompatibilityCategoryScores(
      input.aggregate,
      policy,
    );
    if (!sameValue(input.scores, expectedScores)) invalid();
    const expectedProjection = projectCompatibilityContent(
      input.aggregate,
      input.scores,
      policy,
    );
    if (!sameValue(input.projection, expectedProjection)) invalid();
    const expectedRendered = renderCompatibilityContent(
      input.projection,
      input.aggregate,
      input.scores,
      library,
      policy,
    );
    if (!sameValue(input.rendered, expectedRendered)) invalid();

    const accounting = account(input);
    const firstProvenance = firstSectionProvenance(input.rendered);
    if (
      input.projection.disclaimer !== input.rendered.disclaimer ||
      input.rendered.items.length !== input.projection.items.length ||
      accounting.contributions !== accounting.projectionItems ||
      accounting.renderedFactSections + accounting.unsupportedFactSections !==
        accounting.projectionItems ||
      accounting.renderedReflectionSections +
        accounting.unsupportedReflectionSections !==
        accounting.projectionItems
    )
      invalid();

    return deepFreeze({
      version: COMPATIBILITY_REPORT_VERSION,
      sourceVersions: {
        aggregate: input.projection.sourceVersions.aggregate,
        phaseOne: input.projection.sourceVersions.phaseOne,
        synastry: input.projection.sourceVersions.synastry,
        houseOverlays: input.projection.sourceVersions.houseOverlays,
        scoringResult: input.projection.sourceVersions.scoringResult,
        scoringFormula: input.projection.sourceVersions.scoringFormula,
        scoringPolicy: input.projection.sourceVersions.scoringPolicy,
        projection: input.projection.version,
        renderer: input.rendered.version,
        contentLibrary: firstProvenance.libraryVersion,
        locale: firstProvenance.locale,
      },
      aggregate: input.aggregate,
      scores: input.scores,
      projection: input.projection,
      rendered: input.rendered,
      accounting,
      disclaimer: COMPATIBILITY_REPORT_DISCLAIMER,
    });
  } catch {
    throw new InvalidCompatibilityReportInputError();
  }
}

function account(input: CompatibilityReportInput) {
  const contributions = input.scores.categories.reduce(
    (total, category) => total + category.contributions.length,
    0,
  );
  return {
    categories: input.scores.categories.length,
    contributions,
    projectionItems: input.projection.items.length,
    renderedFactSections: input.rendered.items.filter(
      (item) => item.fact.status === "rendered",
    ).length,
    renderedReflectionSections: input.rendered.items.filter(
      (item) => item.reflection.status === "rendered",
    ).length,
    unsupportedFactSections: input.rendered.items.filter(
      (item) => item.fact.status === "unsupported",
    ).length,
    unsupportedReflectionSections: input.rendered.items.filter(
      (item) => item.reflection.status === "unsupported",
    ).length,
  };
}

function firstSectionProvenance(rendered: RenderedCompatibilityContent) {
  const first = rendered.items[0];
  if (!first) invalid();
  if (!sameValue(first.fact.provenance, first.reflection.provenance)) invalid();
  return first.fact.provenance;
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function invalid(): never {
  throw new RangeError("Invalid compatibility report input");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
