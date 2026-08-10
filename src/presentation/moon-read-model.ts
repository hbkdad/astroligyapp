import {
  PERSONAL_LUNAR_SNAPSHOT_VERSION,
  type PersonalLunarSnapshot,
} from "@/application/derive-personal-lunar-snapshot";
import {
  TIMELINE_FACTS_VERSION,
  type TimelineFact,
  type TimelineFacts,
} from "@/application/compose-timeline-facts";
import { LUNAR_PHASE_ENGINE_VERSION } from "@/domain/lunar/phase";

export const MOON_READ_MODEL_VERSION = "1.0.0";

export type MoonViewState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "unavailable" | "locked" | "error"; message: string }>
  | Readonly<{ status: "ready"; model: MoonReadModel }>;

export interface MoonReadModel {
  readonly version: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly effectiveAt: string;
  readonly effectiveLabel: string;
  readonly current: Readonly<{
    phase: string;
    sign: string;
    illumination: string;
    age: string;
    geometry: string;
    trend: string;
  }>;
  readonly aspects: readonly Readonly<{
    id: string;
    title: string;
    orb: string;
    phase: string;
  }>[];
  readonly upcoming: readonly Readonly<{
    id: string;
    title: string;
    type: string;
    dateLabel: string;
    dateTime: string;
    timeLabel: string;
    sourceVersion: string;
  }>[];
  readonly trace: readonly Readonly<{ label: string; value: string }>[];
}

export function toMoonReadModel(
  snapshot: PersonalLunarSnapshot,
  timeline: TimelineFacts,
): MoonReadModel {
  validateSnapshot(snapshot);
  validateTimeline(timeline, snapshot.input.instant);
  const upcoming = timeline.facts.flatMap((fact) => lunarEvent(fact));
  return deepFreeze({
    version: MOON_READ_MODEL_VERSION,
    eyebrow: "Personal Moon",
    title: `${humanize(snapshot.phase.phase)} Moon in ${humanize(snapshot.phase.moonZodiac.sign)}`,
    effectiveAt: snapshot.input.instant,
    effectiveLabel: `${formatDate(snapshot.input.instant)} at ${formatTime(snapshot.input.instant)} UTC`,
    current: {
      phase: humanize(snapshot.phase.phase),
      sign: humanize(snapshot.phase.moonZodiac.sign),
      illumination: `${formatPercent(snapshot.phase.approximateIlluminatedFraction)} illuminated (approximate geometry)`,
      age: `${formatNumber(snapshot.phase.estimatedAgeDays)} days into the mean cycle (estimated)`,
      geometry: `${formatNumber(snapshot.phase.phaseAngleDegrees)}° Moon–Sun phase angle · ${formatNumber(snapshot.moon.eclipticLongitudeDegrees)}° tropical Moon longitude`,
      trend: humanize(snapshot.phase.illuminationTrend),
    },
    aspects: snapshot.natalAspects.map((aspect) => ({
      id: `personal-lunar:${aspect.natalTarget.id}:${aspect.type}`,
      title: `Moon ${humanize(aspect.type).toLowerCase()} natal ${humanize(aspect.natalTarget.kind === "body" ? aspect.natalTarget.body : aspect.natalTarget.angle)}`,
      orb: `${formatNumber(aspect.orbDegrees)}° orb`,
      phase: humanize(aspect.phase),
    })),
    upcoming,
    trace: [
      {
        label: "Personal lunar snapshot",
        value: snapshot.provenance.personalLunarVersion,
      },
      {
        label: "Lunar phase engine",
        value: snapshot.provenance.lunarPhaseEngineVersion,
      },
      {
        label: "Transit engine",
        value: snapshot.provenance.transitEngineVersion,
      },
      {
        label: "Aspect policy",
        value: `${snapshot.provenance.aspectPolicy.id} ${snapshot.provenance.aspectPolicy.version}`,
      },
      {
        label: "Current-sky provider",
        value: `${snapshot.provenance.currentSkyProvider.providerId} ${snapshot.provenance.currentSkyProvider.providerVersion}`,
      },
      {
        label: "Current-sky data",
        value: snapshot.provenance.currentSkyProvider.dataVersion,
      },
      {
        label: "Lunar event search",
        value: timeline.metadata.sourceVersions.lunarEventSearch,
      },
      { label: "Timeline composition", value: timeline.version },
    ],
  });
}

function lunarEvent(fact: TimelineFact): MoonReadModel["upcoming"][number][] {
  if (fact.type !== "primary-phase" && fact.type !== "moon-sign-ingress")
    return [];
  const event = fact.source.event;
  if (event.type === "primary-phase") {
    return [
      {
        id: fact.id,
        title: humanize(event.phase),
        type: "Primary phase",
        dateLabel: formatDate(event.point.instant),
        dateTime: event.point.instant,
        timeLabel: `${formatTime(event.point.instant)} UTC`,
        sourceVersion: fact.sourceVersion,
      },
    ];
  }
  return [
    {
      id: fact.id,
      title: `Moon enters ${humanize(event.enteredSign)}`,
      type: "Sign ingress",
      dateLabel: formatDate(event.point.instant),
      dateTime: event.point.instant,
      timeLabel: `${formatTime(event.point.instant)} UTC`,
      sourceVersion: fact.sourceVersion,
    },
  ];
}

function validateSnapshot(snapshot: PersonalLunarSnapshot): void {
  if (
    snapshot.provenance.personalLunarVersion !==
      PERSONAL_LUNAR_SNAPSHOT_VERSION ||
    snapshot.provenance.lunarPhaseEngineVersion !==
      LUNAR_PHASE_ENGINE_VERSION ||
    snapshot.moon.body !== "moon" ||
    snapshot.natalAspects.some((aspect) => aspect.transitingBody !== "moon") ||
    !inHalfOpenRange(snapshot.phase.phaseAngleDegrees, 0, 360) ||
    !inClosedRange(snapshot.phase.approximateIlluminatedFraction, 0, 1) ||
    !inClosedRange(snapshot.phase.estimatedAgeDays, 0, 29.53059)
  )
    throw new RangeError("Invalid personal lunar snapshot");
  for (const value of [
    snapshot.provenance.transitEngineVersion,
    snapshot.provenance.aspectPolicy.id,
    snapshot.provenance.aspectPolicy.version,
    snapshot.provenance.currentSkyProvider.providerId,
    snapshot.provenance.currentSkyProvider.providerVersion,
    snapshot.provenance.currentSkyProvider.dataVersion,
  ])
    if (!validText(value))
      throw new RangeError("Lunar source trace is required");
}

function validateTimeline(timeline: TimelineFacts, effectiveAt: string): void {
  if (timeline.version !== TIMELINE_FACTS_VERSION)
    throw new RangeError("Unsupported lunar timeline version");
  const effective = parseInstant(effectiveAt);
  let previous = effective;
  const ids = new Set<string>();
  for (const fact of timeline.facts) {
    if (fact.type !== "primary-phase" && fact.type !== "moon-sign-ingress")
      continue;
    const instant = parseInstant(fact.source.event.point.instant);
    if (instant < effective || instant < previous)
      throw new RangeError("Upcoming lunar facts must be chronological");
    if (ids.has(fact.id) || !validText(fact.sourceVersion))
      throw new RangeError("Upcoming lunar trace is invalid");
    ids.add(fact.id);
    previous = instant;
  }
}

function parseInstant(value: string): number {
  const result = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(result))
    throw new RangeError("Invalid lunar instant");
  return result;
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
function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}
function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(
    value,
  );
}
function humanize(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function inHalfOpenRange(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return Number.isFinite(value) && value >= minimum && value < maximum;
}
function inClosedRange(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}
function validText(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 256 && !/[\r\n]/.test(value);
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
