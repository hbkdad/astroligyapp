import {
  PUBLIC_LUNAR_CALENDAR_VERSION,
  type PublicLunarCalendar,
} from "@/application/calculate-public-lunar-calendar";
import { LUNAR_EVENT_SEARCH_VERSION } from "@/application/search-lunar-events";
import { LUNAR_PHASE_ENGINE_VERSION } from "@/domain/lunar/phase";
import type { publicLunarDateWindow } from "./public-lunar-date";

export const PUBLIC_LUNAR_READ_MODEL_VERSION = "1.0.0";

export function toPublicLunarCalendarReadModel(
  value: PublicLunarCalendar,
  window: NonNullable<ReturnType<typeof publicLunarDateWindow>>,
) {
  if (
    value.version !== PUBLIC_LUNAR_CALENDAR_VERSION ||
    value.date !== window.date ||
    value.timezone !== "UTC" ||
    value.metadata.lunarPhaseEngineVersion !== LUNAR_PHASE_ENGINE_VERSION ||
    value.metadata.lunarEventSearchVersion !== LUNAR_EVENT_SEARCH_VERSION ||
    value.metadata.provider.coordinateOrigin !== "geocentric" ||
    value.metadata.provider.zodiacReference !== "tropical"
  )
    throw new RangeError("Public lunar calendar trace is invalid");
  let previous = "";
  const ids = new Set<string>();
  for (const event of value.events) {
    const instant = event.event.point.instant;
    if (
      ids.has(event.event.id) ||
      event.metadata.searchEngineVersion !== LUNAR_EVENT_SEARCH_VERSION ||
      !sameProvider(event.metadata.provider, value.metadata.provider) ||
      instant < value.interval.startInstant ||
      instant >= value.interval.endInstant ||
      (previous && instant < previous)
    )
      throw new RangeError("Public lunar events are invalid");
    ids.add(event.event.id);
    previous = instant;
  }
  return deepFreeze({
    version: PUBLIC_LUNAR_READ_MODEL_VERSION,
    date: value.date,
    title: `Moon phase for ${formatDate(value.date)}`,
    effectiveLabel: formatInstant(value.effectiveAt),
    phase: label(value.current.phase.phase),
    moonSign: label(value.current.moonZodiac.sign),
    illumination: `${(value.current.phase.approximateIlluminatedFraction * 100).toFixed(1)}% approximate`,
    age: `${value.current.phase.estimatedAgeDays.toFixed(1)} mean-cycle days (estimate)`,
    geometry: `${value.current.phase.phaseAngleDegrees.toFixed(3)}° Moon–Sun angle`,
    trend: value.current.phase.illuminationTrend,
    events: value.events.map((item) => ({
      id: item.event.id,
      type: item.event.type,
      title:
        item.event.type === "primary-phase"
          ? label(item.event.phase)
          : `Moon enters ${label(item.event.enteredSign)}`,
      instant: item.event.point.instant,
      instantLabel: formatInstant(item.event.point.instant),
      angularError: `${item.event.point.angularErrorDegrees.toFixed(6)}°`,
    })),
    previousDate: window.previousDate,
    nextDate: window.nextDate,
    trace: [
      { label: "Calendar engine", value: value.version },
      { label: "Phase engine", value: value.metadata.lunarPhaseEngineVersion },
      { label: "Event search", value: value.metadata.lunarEventSearchVersion },
      {
        label: "Provider",
        value: `${value.metadata.provider.providerId} ${value.metadata.provider.providerVersion}`,
      },
      { label: "Provider data", value: value.metadata.provider.dataVersion },
      { label: "Coordinates", value: "Tropical · geocentric · UTC" },
      {
        label: "Search precision",
        value: `${value.metadata.refinementToleranceSeconds} seconds`,
      },
    ],
  });
}

function sameProvider(
  left: PublicLunarCalendar["metadata"]["provider"],
  right: PublicLunarCalendar["metadata"]["provider"],
) {
  return (
    left.providerId === right.providerId &&
    left.providerVersion === right.providerVersion &&
    left.dataVersion === right.dataVersion &&
    left.timeScale === right.timeScale &&
    left.referenceFrame === right.referenceFrame &&
    left.zodiacReference === right.zodiacReference &&
    left.coordinateOrigin === right.coordinateOrigin
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}
function formatInstant(value: string) {
  return `${new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}
function label(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
