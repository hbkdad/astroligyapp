import type {
  NumerologyResult,
  NumerologyStrategy,
} from "@/domain/numerology/contracts";
import {
  LUNAR_EVENT_SEARCH_VERSION,
  type LunarEventSearchOutput,
} from "./search-lunar-events";
import {
  STATION_EVENT_SEARCH_VERSION,
  type StationEventSearchOutput,
} from "./search-station-events";
import {
  TRANSIT_EVENT_SEARCH_VERSION,
  type TransitEventWindow,
} from "./search-transit-event-window";

export const TIMELINE_FACTS_VERSION = "1.0.0";

export const TIMELINE_FACT_TYPE_ORDER = [
  "personal-transit",
  "primary-phase",
  "moon-sign-ingress",
  "planetary-station",
  "personal-year-boundary",
  "personal-month-boundary",
  "personal-day-boundary",
] as const;

export type TimelineFactType = (typeof TIMELINE_FACT_TYPE_ORDER)[number];
export type NumerologyBoundaryKind =
  "personal-year" | "personal-month" | "personal-day";

const NUMEROLOGY_FACT_TYPES = {
  "personal-year": "personal-year-boundary",
  "personal-month": "personal-month-boundary",
  "personal-day": "personal-day-boundary",
} as const satisfies Record<NumerologyBoundaryKind, TimelineFactType>;

export interface NumerologyBoundaryRequest {
  kind: NumerologyBoundaryKind;
  localDate: string;
  instant: string;
  timezone: string;
  timezoneSource: string;
}

export interface TimelineCompositionInput {
  interval: Readonly<{
    startInstant: string;
    endInstant: string;
  }>;
  transitEvents: readonly TransitEventWindow[];
  lunarEvents: readonly LunarEventSearchOutput[];
  stationEvents: readonly StationEventSearchOutput[];
  numerology?: Readonly<{
    birthDate: string;
    boundaries: readonly NumerologyBoundaryRequest[];
  }>;
}

export type TimelineOccurrence =
  | Readonly<{ kind: "instant"; instant: string }>
  | Readonly<{
      kind: "window";
      startInstant: string;
      peakInstant: string;
      endInstant: string;
    }>;

interface TimelineFactBase {
  id: string;
  type: TimelineFactType;
  occurrence: TimelineOccurrence;
  sourceVersion: string;
}

export type TimelineFact =
  | (TimelineFactBase &
      Readonly<{
        type: "personal-transit";
        source: TransitEventWindow;
      }>)
  | (TimelineFactBase &
      Readonly<{
        type: "primary-phase" | "moon-sign-ingress";
        source: LunarEventSearchOutput;
      }>)
  | (TimelineFactBase &
      Readonly<{
        type: "planetary-station";
        source: StationEventSearchOutput;
      }>)
  | (TimelineFactBase &
      Readonly<{
        type:
          | "personal-year-boundary"
          | "personal-month-boundary"
          | "personal-day-boundary";
        source: Readonly<{
          request: NumerologyBoundaryRequest;
          birthDate: string;
          result: NumerologyResult;
        }>;
      }>);

export interface TimelineFacts {
  version: string;
  interval: TimelineCompositionInput["interval"];
  facts: readonly TimelineFact[];
  metadata: Readonly<{
    composedAt: string;
    sourceVersions: Readonly<{
      transitEventSearch: string;
      lunarEventSearch: string;
      stationEventSearch: string;
      numerologyStrategy?: Readonly<{ id: string; version: string }>;
    }>;
  }>;
}

export function composeTimelineFacts(
  input: TimelineCompositionInput,
  numerologyStrategy?: NumerologyStrategy,
  now: () => Date = () => new Date(),
): TimelineFacts {
  const interval = validateInterval(input.interval);
  if (input.numerology && !numerologyStrategy)
    throw new RangeError("Numerology boundaries require an explicit strategy");
  if (!input.numerology && numerologyStrategy)
    throw new RangeError("Numerology strategy requires boundary input");
  validateStrategy(numerologyStrategy);

  const facts: TimelineFact[] = [];
  for (const source of input.transitEvents) {
    validateTransitSource(source, interval);
    facts.push({
      id: source.event.id,
      type: "personal-transit",
      occurrence: {
        kind: "window",
        startInstant: source.event.start.instant,
        peakInstant: source.event.peak.instant,
        endInstant: source.event.end.instant,
      },
      sourceVersion: source.metadata.searchEngineVersion,
      source: structuredClone(source),
    });
  }
  for (const source of input.lunarEvents) {
    validateLunarSource(source, interval);
    facts.push({
      id: source.event.id,
      type:
        source.event.type === "primary-phase"
          ? "primary-phase"
          : "moon-sign-ingress",
      occurrence: { kind: "instant", instant: source.event.point.instant },
      sourceVersion: source.metadata.searchEngineVersion,
      source: structuredClone(source),
    });
  }
  for (const source of input.stationEvents) {
    validateStationSource(source, interval);
    facts.push({
      id: source.event.id,
      type: "planetary-station",
      occurrence: { kind: "instant", instant: source.event.instant },
      sourceVersion: source.metadata.searchEngineVersion,
      source: structuredClone(source),
    });
  }
  if (input.numerology && numerologyStrategy) {
    validatePlainDate(input.numerology.birthDate, "birth date");
    for (const request of input.numerology.boundaries) {
      facts.push(
        buildNumerologyFact(
          input.numerology.birthDate,
          request,
          numerologyStrategy,
          interval,
        ),
      );
    }
  }

  const ids = facts.map((fact) => fact.id);
  if (new Set(ids).size !== ids.length)
    throw new RangeError("Timeline fact IDs must be unique");
  facts.sort(compareFacts);
  return deepFreeze({
    version: TIMELINE_FACTS_VERSION,
    interval: structuredClone(input.interval),
    facts,
    metadata: {
      composedAt: now().toISOString(),
      sourceVersions: {
        transitEventSearch: TRANSIT_EVENT_SEARCH_VERSION,
        lunarEventSearch: LUNAR_EVENT_SEARCH_VERSION,
        stationEventSearch: STATION_EVENT_SEARCH_VERSION,
        ...(numerologyStrategy
          ? {
              numerologyStrategy: {
                id: numerologyStrategy.id,
                version: numerologyStrategy.version,
              },
            }
          : {}),
      },
    },
  });
}

function buildNumerologyFact(
  birthDate: string,
  request: NumerologyBoundaryRequest,
  strategy: NumerologyStrategy,
  interval: ValidatedInterval,
): TimelineFact {
  if (!(request.kind in NUMEROLOGY_FACT_TYPES))
    throw new RangeError("Invalid numerology boundary kind");
  const date = validatePlainDate(request.localDate, "boundary date");
  const instant = parseUtcInstant(request.instant, "boundary instant");
  assertInsideInterval(instant, interval, "Numerology boundary");
  validateTimezone(request.timezone, request.timezoneSource);
  validateLocalMidnight(date, instant, request.timezone);
  if (request.kind === "personal-month" && date.day !== 1)
    throw new RangeError("Personal month boundaries require day 1");
  if (request.kind === "personal-year" && (date.month !== 1 || date.day !== 1))
    throw new RangeError("Personal year boundaries require January 1");
  const result =
    request.kind === "personal-year"
      ? strategy.calculatePersonalYear(birthDate, date.year)
      : request.kind === "personal-month"
        ? strategy.calculatePersonalMonth(birthDate, date.year, date.month)
        : strategy.calculatePersonalDay(birthDate, request.localDate);
  validateNumerologyResult(result, strategy);
  const type = NUMEROLOGY_FACT_TYPES[request.kind];
  return {
    id: `numerology:${request.kind}:${request.localDate}:${request.timezone}`,
    type,
    occurrence: { kind: "instant", instant: request.instant },
    sourceVersion: strategy.version,
    source: {
      request: structuredClone(request),
      birthDate,
      result: structuredClone(result),
    },
  };
}

function validateTransitSource(
  source: TransitEventWindow,
  interval: ValidatedInterval,
): void {
  if (source.metadata.searchEngineVersion !== TRANSIT_EVENT_SEARCH_VERSION)
    throw new RangeError("Unsupported transit event search version");
  const start = parseUtcInstant(source.event.start.instant, "transit start");
  const peak = parseUtcInstant(source.event.peak.instant, "transit peak");
  const end = parseUtcInstant(source.event.end.instant, "transit end");
  if (!(start < peak && peak < end))
    throw new RangeError("Transit event window must be strictly ordered");
  assertInsideInterval(start, interval, "Transit start");
  assertInsideInterval(peak, interval, "Transit peak");
  assertInsideInterval(end, interval, "Transit end");
  if (
    source.event.id !==
      `transit:${source.event.transitingBody}:${source.event.natalTarget.id}:${source.event.aspect.type}:${source.event.peak.instant}` ||
    source.input.transitingBody !== source.event.transitingBody ||
    source.input.natalTargetId !== source.event.natalTarget.id ||
    source.input.aspectType !== source.event.aspect.type
  )
    throw new RangeError("Transit event identity is inconsistent");
  validateSearchMetadata(source.metadata, "transit");
}

function validateLunarSource(
  source: LunarEventSearchOutput,
  interval: ValidatedInterval,
): void {
  if (source.metadata.searchEngineVersion !== LUNAR_EVENT_SEARCH_VERSION)
    throw new RangeError("Unsupported lunar event search version");
  const instant = parseUtcInstant(source.event.point.instant, "lunar event");
  assertInsideInterval(instant, interval, "Lunar event");
  if (source.input.eventType !== source.event.type)
    throw new RangeError("Lunar event type is inconsistent");
  if (
    (source.event.type === "primary-phase" &&
      source.input.eventType === "primary-phase" &&
      source.input.phase !== source.event.phase) ||
    (source.event.type === "moon-sign-ingress" &&
      source.input.eventType === "moon-sign-ingress" &&
      source.input.enteredSign !== source.event.enteredSign)
  )
    throw new RangeError("Lunar event target is inconsistent");
  const expectedId =
    source.event.type === "primary-phase"
      ? `lunar:phase:${source.event.phase}:${source.event.point.instant}`
      : `lunar:ingress:${source.event.enteredSign}:${source.event.point.instant}`;
  if (source.event.id !== expectedId)
    throw new RangeError("Lunar event identity is inconsistent");
  validateSearchMetadata(source.metadata, "lunar");
}

function validateStationSource(
  source: StationEventSearchOutput,
  interval: ValidatedInterval,
): void {
  if (source.metadata.searchEngineVersion !== STATION_EVENT_SEARCH_VERSION)
    throw new RangeError("Unsupported station event search version");
  const instant = parseUtcInstant(source.event.instant, "station event");
  assertInsideInterval(instant, interval, "Station event");
  if (
    source.event.id !==
      `station:${source.event.body}:${source.event.type}:${source.event.instant}` ||
    source.input.body !== source.event.body ||
    source.input.eventType !== source.event.type
  )
    throw new RangeError("Station event identity is inconsistent");
  validateSearchMetadata(source.metadata, "station");
}

function validateSearchMetadata(
  metadata: {
    provider: {
      providerId: string;
      providerVersion: string;
      dataVersion: string;
    };
    searchPolicy: { initialSampleCount: number; evaluationCount: number };
    evaluations: readonly { instant: string }[];
  },
  label: string,
): void {
  for (const value of [
    metadata.provider.providerId,
    metadata.provider.providerVersion,
    metadata.provider.dataVersion,
  ])
    if (!validText(value))
      throw new RangeError(`Invalid ${label} provider trace`);
  if (
    !Number.isInteger(metadata.searchPolicy.initialSampleCount) ||
    metadata.searchPolicy.initialSampleCount < 2 ||
    !Number.isInteger(metadata.searchPolicy.evaluationCount) ||
    metadata.searchPolicy.evaluationCount !== metadata.evaluations.length ||
    metadata.evaluations.length < metadata.searchPolicy.initialSampleCount ||
    new Set(metadata.evaluations.map((item) => item.instant)).size !==
      metadata.evaluations.length
  )
    throw new RangeError(`Invalid ${label} evaluation trace`);
  for (const item of metadata.evaluations)
    parseUtcInstant(item.instant, `${label} evaluation`);
}

function validateNumerologyResult(
  result: NumerologyResult,
  strategy: NumerologyStrategy,
): void {
  if (
    result.strategyId !== strategy.id ||
    result.strategyVersion !== strategy.version ||
    !Number.isInteger(result.value) ||
    result.value < 1 ||
    result.tokens.length === 0 ||
    result.trace.length === 0
  )
    throw new RangeError("Invalid numerology boundary result");
}

interface ValidatedInterval {
  start: number;
  end: number;
}

function validateInterval(
  interval: TimelineCompositionInput["interval"],
): ValidatedInterval {
  const start = parseUtcInstant(interval.startInstant, "timeline start");
  const end = parseUtcInstant(interval.endInstant, "timeline end");
  if (start >= end)
    throw new RangeError("Timeline interval must be increasing");
  return { start, end };
}

function assertInsideInterval(
  instant: number,
  interval: ValidatedInterval,
  label: string,
): void {
  if (instant < interval.start || instant >= interval.end)
    throw new RangeError(`${label} is outside the timeline interval`);
}

function compareFacts(left: TimelineFact, right: TimelineFact): number {
  return (
    occurrenceStart(left.occurrence) - occurrenceStart(right.occurrence) ||
    TIMELINE_FACT_TYPE_ORDER.indexOf(left.type) -
      TIMELINE_FACT_TYPE_ORDER.indexOf(right.type) ||
    left.id.localeCompare(right.id, "en")
  );
}

function occurrenceStart(occurrence: TimelineOccurrence): number {
  return Date.parse(
    occurrence.kind === "instant"
      ? occurrence.instant
      : occurrence.startInstant,
  );
}

function validateStrategy(strategy: NumerologyStrategy | undefined): void {
  if (
    strategy &&
    (!validText(strategy.id) ||
      !validText(strategy.version) ||
      typeof strategy.calculatePersonalYear !== "function" ||
      typeof strategy.calculatePersonalMonth !== "function" ||
      typeof strategy.calculatePersonalDay !== "function")
  )
    throw new RangeError("Invalid numerology strategy trace");
}

function validateTimezone(timezone: string, source: string): void {
  if (!validText(timezone) || !validText(source))
    throw new RangeError("Numerology boundary timezone provenance is required");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
  } catch {
    throw new RangeError("Numerology boundary timezone must be an IANA zone");
  }
}

function validateLocalMidnight(
  date: { year: number; month: number; day: number },
  instant: number,
  timezone: string,
): void {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  if (
    values.year !== date.year ||
    values.month !== date.month ||
    values.day !== date.day ||
    values.hour !== 0 ||
    values.minute !== 0 ||
    values.second !== 0
  )
    throw new RangeError(
      "Numerology boundary instant must be local midnight on its declared date",
    );
}

function validatePlainDate(
  value: string,
  label: string,
): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid ${label}`);
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  if (
    year! < 1 ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  )
    throw new RangeError(`Invalid ${label}`);
  return { year: year!, month: month!, day: day! };
}

function parseUtcInstant(value: string, label: string): number {
  const match =
    typeof value === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(
          value,
        )
      : null;
  if (!match) throw new RangeError(`Invalid ${label}`);
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const epoch = Date.parse(value);
  const parsed = new Date(epoch);
  if (
    !Number.isFinite(epoch) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  )
    throw new RangeError(`Invalid ${label}`);
  return epoch;
}

function validText(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 128 && !/[\r\n]/.test(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
