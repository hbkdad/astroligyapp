import {
  calculatePersonalCategoryScores,
  type CategoryScoreOutput,
} from "./calculate-category-scores";
import type { PersonalContextFacts } from "./compose-personal-context";
import { prepareInterpretationRenderData } from "./project-interpretations";
import {
  renderInterpretations,
  type RenderedInterpretationOutput,
} from "./render-interpretations";
import { DEFAULT_CATEGORY_SCORE_MODEL } from "@/config/category-model";
import type {
  CategoryContribution,
  CategoryKey,
  CategoryScoreModel,
} from "@/domain/category/contracts";
import type { InterpretationLibrary } from "@/domain/interpretation/contracts";
import { DEFAULT_INTERPRETATION_LIBRARY } from "@/domain/interpretation/library";

export const DAILY_READING_VERSION = "1.0.0";
export const DAILY_READING_SIGNAL_LIMIT = 5;

export interface DailyReadingSignal extends CategoryContribution {
  readonly category: CategoryKey;
  readonly categoryScore: number;
}

export interface DailyReadingPayload {
  readonly effectiveAt: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly context: PersonalContextFacts;
  readonly interpretations: RenderedInterpretationOutput;
  readonly categories: CategoryScoreOutput;
  readonly strongestSignals: readonly DailyReadingSignal[];
  readonly metadata: Readonly<{
    readingVersion: string;
    contextVersion: string;
    projectionVersion: string;
    libraryId: string;
    libraryVersion: string;
    locale: string;
    rendererVersion: string;
    scoreModelId: string;
    scoreModelVersion: string;
    scoreFormulaVersion: string;
    signalOrdering: "absolute impact desc, confidence desc, category, source fact, rule";
  }>;
}

export function composeDailyReading(
  context: PersonalContextFacts,
  library: InterpretationLibrary = DEFAULT_INTERPRETATION_LIBRARY,
  scoreModel: CategoryScoreModel = DEFAULT_CATEGORY_SCORE_MODEL,
): DailyReadingPayload {
  const prepared = prepareInterpretationRenderData(context, library);
  return assembleDailyReading(
    context,
    renderInterpretations(prepared),
    calculatePersonalCategoryScores(context, scoreModel),
  );
}

export function assembleDailyReading(
  context: PersonalContextFacts,
  interpretations: RenderedInterpretationOutput,
  categories: CategoryScoreOutput,
): DailyReadingPayload {
  const factIds = context.facts.map((fact) => fact.id);
  if (
    new Set(interpretations.items.map((item) => item.key)).size !==
    interpretations.items.length
  ) {
    throw new RangeError("Daily reading interpretation keys must be unique");
  }
  const interpretationFactIds = interpretations.items.map((item) =>
    item.status === "rendered"
      ? item.fact.provenance.sourceFactId
      : item.fallback.provenance.sourceFactId,
  );
  if (
    interpretations.effectiveAt !== context.effectiveAt ||
    categories.effectiveAt !== context.effectiveAt ||
    factIds.length !== interpretationFactIds.length ||
    factIds.some((id, index) => id !== interpretationFactIds[index])
  ) {
    throw new RangeError(
      "Daily reading components have mismatched fact coverage",
    );
  }

  const knownFacts = new Set(factIds);
  const allContributions = categories.scores.flatMap((score) => {
    if (
      score.sourceFactIds.some((id) => !knownFacts.has(id)) ||
      score.contributingFactors.some(
        (factor) => !knownFacts.has(factor.sourceFactId),
      )
    ) {
      throw new RangeError("Daily reading category references an unknown fact");
    }
    return score.contributingFactors.map((factor) => ({
      ...factor,
      category: score.category,
      categoryScore: score.score,
    }));
  });
  const contributionKeys = allContributions.map(
    (factor) => `${factor.category}|${factor.ruleId}|${factor.projectionKey}`,
  );
  if (new Set(contributionKeys).size !== contributionKeys.length) {
    throw new RangeError("Daily reading contributions must be unique");
  }

  const firstProvenance = provenanceOf(interpretations.items[0]);
  if (
    !firstProvenance ||
    firstProvenance.contextVersion !== context.metadata.contextVersion ||
    categories.metadata.contextVersion !== context.metadata.contextVersion ||
    categories.metadata.projectionVersion !== firstProvenance.projectionVersion
  ) {
    throw new RangeError("Daily reading component versions are inconsistent");
  }
  for (const item of interpretations.items) {
    const provenance = provenanceOf(item);
    if (
      !provenance ||
      !sameProvenanceVersions(firstProvenance, provenance) ||
      (item.status === "rendered" &&
        (!sameProvenanceVersions(
          item.fact.provenance,
          item.interpretation.provenance,
        ) ||
          item.fact.provenance.sourceFactId !==
            item.interpretation.provenance.sourceFactId ||
          item.fact.provenance.projectionKey !==
            item.interpretation.provenance.projectionKey))
    ) {
      throw new RangeError(
        "Daily reading interpretation versions are inconsistent",
      );
    }
  }

  const strongestSignals = allContributions
    .sort(compareSignals)
    .slice(0, DAILY_READING_SIGNAL_LIMIT);
  return deepFreeze({
    effectiveAt: context.effectiveAt,
    localDate: context.localDate,
    timezone: context.timezone,
    context,
    interpretations,
    categories,
    strongestSignals,
    metadata: {
      readingVersion: DAILY_READING_VERSION,
      contextVersion: context.metadata.contextVersion,
      projectionVersion: firstProvenance.projectionVersion,
      libraryId: firstProvenance.libraryId,
      libraryVersion: firstProvenance.libraryVersion,
      locale: firstProvenance.locale,
      rendererVersion: firstProvenance.rendererVersion,
      scoreModelId: categories.metadata.modelId,
      scoreModelVersion: categories.metadata.modelVersion,
      scoreFormulaVersion: categories.metadata.formulaVersion,
      signalOrdering:
        "absolute impact desc, confidence desc, category, source fact, rule" as const,
    },
  });
}

function provenanceOf(
  item: RenderedInterpretationOutput["items"][number] | undefined,
) {
  if (!item) return undefined;
  return item.status === "rendered"
    ? item.fact.provenance
    : item.fallback.provenance;
}

function sameProvenanceVersions(
  left: NonNullable<ReturnType<typeof provenanceOf>>,
  right: NonNullable<ReturnType<typeof provenanceOf>>,
): boolean {
  return (
    left.projectionVersion === right.projectionVersion &&
    left.contextVersion === right.contextVersion &&
    left.libraryId === right.libraryId &&
    left.libraryVersion === right.libraryVersion &&
    left.locale === right.locale &&
    left.rendererVersion === right.rendererVersion
  );
}

function compareSignals(
  left: DailyReadingSignal,
  right: DailyReadingSignal,
): number {
  return (
    Math.abs(right.impact) - Math.abs(left.impact) ||
    right.confidence - left.confidence ||
    left.category.localeCompare(right.category) ||
    left.sourceFactId.localeCompare(right.sourceFactId) ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
