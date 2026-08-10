import type { CategoryScoreOutput } from "@/application/calculate-category-scores";
import type {
  DailyReadingPayload,
  DailyReadingSignal,
} from "@/application/compose-daily-reading";
import type { RenderedInterpretationItem } from "@/application/render-interpretations";
import type { ContextNumerologyKey } from "@/domain/context/contracts";
import {
  TIMELINE_READ_MODEL_VERSION,
  type TimelineReadModel,
} from "./timeline-read-model";

export const DASHBOARD_READ_MODEL_VERSION = "1.0.0";

export interface DashboardReadingSource {
  readonly effectiveAt: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly moon: Readonly<{
    phase: string;
    sign: string;
    illuminatedFraction: number;
    phaseAngleDegrees: number;
  }>;
  readonly numerology: Readonly<
    Partial<
      Record<
        ContextNumerologyKey,
        Readonly<{ value: number; masterNumber: boolean }>
      >
    >
  >;
  readonly interpretations: readonly RenderedInterpretationItem[];
  readonly categories: CategoryScoreOutput;
  readonly strongestSignals: readonly DailyReadingSignal[];
  readonly timeline: TimelineReadModel;
  readonly versions: Readonly<{
    reading: string;
    context: string;
    projection: string;
    library: string;
    renderer: string;
    scoreModel: string;
    scoreFormula: string;
  }>;
}

export type DashboardState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "locked"; message: string }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "ready"; model: DashboardReadModel }>;

export interface DashboardReadModel {
  readonly version: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly dateLabel: string;
  readonly timezoneLabel: string;
  readonly summary: string;
  readonly moon: Readonly<{
    phase: string;
    sign: string;
    illuminationLabel: string;
    geometryLabel: string;
  }>;
  readonly numerology: readonly Readonly<{
    key: string;
    label: string;
    value: number;
    masterNumber: boolean;
  }>[];
  readonly categories: readonly Readonly<{
    key: string;
    label: string;
    score: number;
    confidenceLabel: string;
    sourceCountLabel: string;
    heuristicLabel: string;
  }>[];
  readonly signals: readonly Readonly<{
    id: string;
    category: string;
    impactLabel: string;
    rationale: string;
    sourceFactId: string;
  }>[];
  readonly reflections: readonly Readonly<{
    id: string;
    fact: string;
    interpretation: string;
    sourceFactId: string;
  }>[];
  readonly timelinePreview: readonly DashboardTimelineItem[];
  readonly nextEvent?: DashboardTimelineItem;
  readonly trace: readonly Readonly<{ label: string; value: string }>[];
}

export interface DashboardTimelineItem {
  readonly id: string;
  readonly title: string;
  readonly categoryLabel: string;
  readonly dateLabel: string;
  readonly dateTime: string;
  readonly occurrenceKind: "instant" | "window";
  readonly occurrenceLabel: string;
  readonly sourceVersion: string;
}

export function sourceFromDailyReading(
  reading: DailyReadingPayload,
  timeline: TimelineReadModel,
): DashboardReadingSource {
  return {
    effectiveAt: reading.effectiveAt,
    localDate: reading.localDate,
    timezone: reading.timezone,
    moon: {
      phase: reading.context.lunar.phase.phase,
      sign: reading.context.lunar.phase.moonZodiac.sign,
      illuminatedFraction:
        reading.context.lunar.phase.approximateIlluminatedFraction,
      phaseAngleDegrees: reading.context.lunar.phase.phaseAngleDegrees,
    },
    numerology: reading.context.numerology.results,
    interpretations: reading.interpretations.items,
    categories: reading.categories,
    strongestSignals: reading.strongestSignals,
    timeline,
    versions: {
      reading: reading.metadata.readingVersion,
      context: reading.metadata.contextVersion,
      projection: reading.metadata.projectionVersion,
      library: reading.metadata.libraryVersion,
      renderer: reading.metadata.rendererVersion,
      scoreModel: reading.metadata.scoreModelVersion,
      scoreFormula: reading.metadata.scoreFormulaVersion,
    },
  };
}

export function toDashboardReadModel(
  source: DashboardReadingSource,
): DashboardReadModel {
  validateSource(source);
  const phase = humanize(source.moon.phase);
  const sign = humanize(source.moon.sign);
  const reflections = source.interpretations.flatMap((item) => {
    if (item.status !== "rendered") return [];
    return [
      {
        id: item.key,
        fact: item.fact.text,
        interpretation: item.interpretation.text,
        sourceFactId: item.fact.provenance.sourceFactId,
      },
    ];
  });
  const effectiveAt = Date.parse(source.effectiveAt);
  const upcoming = source.timeline.items
    .filter((item) => Date.parse(item.dateTime) >= effectiveAt)
    .map((item) => ({
      id: item.id,
      title: item.title,
      categoryLabel: item.categoryLabel,
      dateLabel: item.dateLabel,
      dateTime: item.dateTime,
      occurrenceKind: item.occurrenceKind,
      occurrenceLabel: item.occurrenceLabel,
      sourceVersion: item.sourceVersion,
    }));
  const nextEvent = upcoming[0];
  return deepFreeze({
    version: DASHBOARD_READ_MODEL_VERSION,
    eyebrow: "Personal daily context",
    title: "Today, translated from traceable facts.",
    dateLabel: formatLocalDate(source.localDate),
    timezoneLabel: source.timezone.replaceAll("_", " "),
    summary: `${phase} Moon in ${sign}. ${source.strongestSignals.length} strongest ${source.strongestSignals.length === 1 ? "signal" : "signals"} from the configured product model.`,
    moon: {
      phase,
      sign,
      illuminationLabel: `${formatPercent(source.moon.illuminatedFraction)} illuminated (approximate)`,
      geometryLabel: `${formatNumber(source.moon.phaseAngleDegrees)}° Moon–Sun phase angle`,
    },
    numerology: Object.entries(source.numerology).map(([key, result]) => ({
      key,
      label: humanize(key),
      value: result.value,
      masterNumber: result.masterNumber,
    })),
    categories: source.categories.scores.map((score) => ({
      key: score.category,
      label: humanize(score.category),
      score: score.score,
      confidenceLabel: `${formatPercent(score.confidence)} model confidence`,
      sourceCountLabel: `${score.sourceFactIds.length} source ${score.sourceFactIds.length === 1 ? "fact" : "facts"}`,
      heuristicLabel: score.label,
    })),
    signals: source.strongestSignals.map((signal) => ({
      id: `${signal.category}:${signal.ruleId}:${signal.projectionKey}`,
      category: humanize(signal.category),
      impactLabel: `${signal.impact >= 0 ? "+" : ""}${formatNumber(signal.impact)} configured impact`,
      rationale: signal.rationale,
      sourceFactId: signal.sourceFactId,
    })),
    reflections: reflections.slice(0, 4),
    timelinePreview: upcoming.slice(1, 4),
    ...(nextEvent ? { nextEvent } : {}),
    trace: [
      { label: "Reading", value: source.versions.reading },
      { label: "Context", value: source.versions.context },
      { label: "Projection", value: source.versions.projection },
      { label: "Library", value: source.versions.library },
      { label: "Renderer", value: source.versions.renderer },
      { label: "Score model", value: source.versions.scoreModel },
      { label: "Score formula", value: source.versions.scoreFormula },
      { label: "Timeline read model", value: source.timeline.version },
      { label: "Timeline facts", value: source.timeline.sourceVersion },
    ],
  });
}

function validateSource(source: DashboardReadingSource): void {
  const effectiveAt = Date.parse(source.effectiveAt);
  if (
    !Number.isFinite(effectiveAt) ||
    !source.localDate.trim() ||
    !source.timezone.trim() ||
    !Number.isFinite(source.moon.illuminatedFraction) ||
    source.moon.illuminatedFraction < 0 ||
    source.moon.illuminatedFraction > 1 ||
    !Number.isFinite(source.moon.phaseAngleDegrees)
  ) {
    throw new RangeError("Dashboard source contains invalid display facts");
  }
  if (
    new Set(source.categories.scores.map((item) => item.category)).size !==
    source.categories.scores.length
  ) {
    throw new RangeError("Dashboard categories must be unique");
  }
  for (const version of Object.values(source.versions)) {
    if (!version.trim())
      throw new RangeError("Dashboard versions are required");
  }
  if (source.timeline.version !== TIMELINE_READ_MODEL_VERSION)
    throw new RangeError("Dashboard timeline version is unsupported");
  const ids = source.timeline.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length)
    throw new RangeError("Dashboard timeline IDs must be unique");
  for (const [index, item] of source.timeline.items.entries()) {
    if (
      !item.id.trim() ||
      !item.sourceVersion.trim() ||
      !Number.isFinite(Date.parse(item.dateTime)) ||
      (index > 0 &&
        Date.parse(source.timeline.items[index - 1]!.dateTime) >
          Date.parse(item.dateTime))
    )
      throw new RangeError("Dashboard timeline facts are invalid");
  }
}

function humanize(value: string): string {
  return value
    .split(/[._\-/]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatLocalDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf()))
    throw new RangeError("Invalid local date");
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
