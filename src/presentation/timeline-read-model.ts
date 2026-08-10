import {
  TIMELINE_FACTS_VERSION,
  TIMELINE_FACT_TYPE_ORDER,
  type TimelineFact,
  type TimelineFacts,
} from "@/application/compose-timeline-facts";

export const TIMELINE_READ_MODEL_VERSION = "1.0.0";

export const TIMELINE_FILTERS = [
  "all",
  "transits",
  "moon",
  "stations",
  "cycles",
] as const;

export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

export type TimelineState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "locked"; message: string }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "ready"; model: TimelineReadModel }>;

export interface TimelineReadModel {
  readonly version: string;
  readonly sourceVersion: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly intervalLabel: string;
  readonly filters: readonly Readonly<{
    key: TimelineFilter;
    label: string;
    count: number;
  }>[];
  readonly items: readonly TimelineReadModelItem[];
  readonly trace: readonly Readonly<{ label: string; value: string }>[];
}

export interface TimelineReadModelItem {
  readonly id: string;
  readonly filter: Exclude<TimelineFilter, "all">;
  readonly type: TimelineFact["type"];
  readonly categoryLabel: string;
  readonly title: string;
  readonly detail: string;
  readonly dateLabel: string;
  readonly dateTime: string;
  readonly occurrenceLabel: string;
  readonly sourceReference: string;
  readonly sourceVersion: string;
}

export function toTimelineReadModel(
  timeline: TimelineFacts,
): TimelineReadModel {
  validateTimeline(timeline);
  const items = timeline.facts.map(toItem);
  const filters = TIMELINE_FILTERS.map((key) => ({
    key,
    label: FILTER_LABELS[key],
    count:
      key === "all"
        ? items.length
        : items.filter((item) => item.filter === key).length,
  }));
  return deepFreeze({
    version: TIMELINE_READ_MODEL_VERSION,
    sourceVersion: timeline.version,
    eyebrow: "Personal event calendar",
    title: "Your traceable timeline.",
    summary:
      "Calculated event windows and calendar boundaries, kept in deterministic order. Filters change only what is visible.",
    intervalLabel: `${formatDate(timeline.interval.startInstant)} to ${formatDate(timeline.interval.endInstant)} (end exclusive)`,
    filters,
    items,
    trace: [
      { label: "Timeline composition", value: timeline.version },
      {
        label: "Transit event search",
        value: timeline.metadata.sourceVersions.transitEventSearch,
      },
      {
        label: "Lunar event search",
        value: timeline.metadata.sourceVersions.lunarEventSearch,
      },
      {
        label: "Station event search",
        value: timeline.metadata.sourceVersions.stationEventSearch,
      },
      ...(timeline.metadata.sourceVersions.numerologyStrategy
        ? [
            {
              label: "Numerology strategy",
              value: `${timeline.metadata.sourceVersions.numerologyStrategy.id} ${timeline.metadata.sourceVersions.numerologyStrategy.version}`,
            },
          ]
        : []),
    ],
  });
}

function toItem(fact: TimelineFact): TimelineReadModelItem {
  const common = {
    id: fact.id,
    type: fact.type,
    dateLabel: formatDate(occurrenceStart(fact)),
    dateTime: occurrenceStart(fact),
    occurrenceLabel: formatOccurrence(fact),
    sourceReference: fact.id,
    sourceVersion: fact.sourceVersion,
  };
  if (fact.type === "personal-transit") {
    const event = fact.source.event;
    return {
      ...common,
      filter: "transits",
      categoryLabel: "Personal transit",
      title: `${humanize(event.transitingBody)} ${humanize(event.aspect.type)} natal ${humanize(event.natalTarget.kind === "body" ? event.natalTarget.body : event.natalTarget.angle)}`,
      detail: `A calculated ${humanize(event.aspect.type).toLowerCase()} window with ${formatNumber(event.aspect.maximumOrbDegrees)}° configured orb.`,
    };
  }
  if (fact.type === "primary-phase") {
    const event = fact.source.event;
    if (event.type !== "primary-phase")
      throw new RangeError("Timeline lunar fact type mismatch");
    return {
      ...common,
      filter: "moon",
      categoryLabel: "Moon phase",
      title: humanize(event.phase),
      detail: `${formatNumber(event.geometry.phaseAngleDegrees)}° Moon–Sun phase angle at the refined event instant.`,
    };
  }
  if (fact.type === "moon-sign-ingress") {
    const event = fact.source.event;
    if (event.type !== "moon-sign-ingress")
      throw new RangeError("Timeline lunar fact type mismatch");
    return {
      ...common,
      filter: "moon",
      categoryLabel: "Moon ingress",
      title: `Moon enters ${humanize(event.enteredSign)}`,
      detail: `Crosses the ${formatNumber(event.boundaryLongitudeDegrees)}° tropical sign boundary.`,
    };
  }
  if (fact.type === "planetary-station") {
    const event = fact.source.event;
    return {
      ...common,
      filter: "stations",
      categoryLabel: "Planetary station",
      title: `${humanize(event.body)} stations ${event.type === "station-retrograde" ? "retrograde" : "direct"}`,
      detail: `${formatNumber(event.longitudeDegrees)}° tropical longitude; motion changes from ${event.motionBefore} to ${event.motionAfter}.`,
    };
  }
  if (!("result" in fact.source))
    throw new RangeError("Timeline numerology fact type mismatch");
  const result = fact.source.result;
  const cycle = fact.type.replace("-boundary", "");
  return {
    ...common,
    filter: "cycles",
    categoryLabel: "Numerology boundary",
    title: `${humanize(cycle)} ${result.value} begins`,
    detail: `${fact.source.request.localDate} local calendar boundary in ${fact.source.request.timezone.replaceAll("_", " ")}.`,
  };
}

function validateTimeline(timeline: TimelineFacts): void {
  if (timeline.version !== TIMELINE_FACTS_VERSION)
    throw new RangeError("Unsupported timeline composition version");
  const start = parseInstant(timeline.interval.startInstant);
  const end = parseInstant(timeline.interval.endInstant);
  if (start >= end) throw new RangeError("Invalid timeline interval");
  const ids = timeline.facts.map((fact) => fact.id);
  if (new Set(ids).size !== ids.length)
    throw new RangeError("Timeline fact IDs must be unique");
  for (const [index, fact] of timeline.facts.entries()) {
    if (!validText(fact.id) || !validText(fact.sourceVersion))
      throw new RangeError("Timeline fact trace is required");
    const time = parseInstant(occurrenceStart(fact));
    if (time < start || time >= end)
      throw new RangeError("Timeline fact is outside the display interval");
    if (index > 0 && compareFacts(timeline.facts[index - 1]!, fact) > 0)
      throw new RangeError("Timeline facts must retain deterministic ordering");
  }
  for (const value of Object.values(timeline.metadata.sourceVersions)) {
    if (
      typeof value === "string"
        ? !validText(value)
        : !validText(value.id) || !validText(value.version)
    )
      throw new RangeError("Timeline source versions are required");
  }
}

function compareFacts(left: TimelineFact, right: TimelineFact): number {
  return (
    Date.parse(occurrenceStart(left)) - Date.parse(occurrenceStart(right)) ||
    TIMELINE_FACT_TYPE_ORDER.indexOf(left.type) -
      TIMELINE_FACT_TYPE_ORDER.indexOf(right.type) ||
    left.id.localeCompare(right.id, "en")
  );
}

function occurrenceStart(fact: TimelineFact): string {
  return fact.occurrence.kind === "instant"
    ? fact.occurrence.instant
    : fact.occurrence.startInstant;
}

function formatOccurrence(fact: TimelineFact): string {
  if (fact.occurrence.kind === "instant")
    return `${formatTime(fact.occurrence.instant)} UTC instant`;
  return `Starts ${formatDateTime(fact.occurrence.startInstant)}; exact ${formatDateTime(fact.occurrence.peakInstant)}; ends ${formatDateTime(fact.occurrence.endInstant)} UTC`;
}

function parseInstant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))
    throw new RangeError("Invalid timeline instant");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new RangeError("Invalid timeline instant");
  return parsed;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parseInstant(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(parseInstant(value));
}

function formatDateTime(value: string): string {
  return `${formatDate(value)} at ${formatTime(value)}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError("Invalid timeline number");
  return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 3 }).format(
    value,
  );
}

function humanize(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function validText(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 256 && !/[\r\n]/.test(value);
}

const FILTER_LABELS: Record<TimelineFilter, string> = {
  all: "All events",
  transits: "Transits",
  moon: "Moon",
  stations: "Stations",
  cycles: "Personal cycles",
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
