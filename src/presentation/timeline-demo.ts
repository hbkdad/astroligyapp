import { DEFAULT_ASPECT_DEFINITIONS } from "@/domain/astro/aspects";
import {
  composeTimelineFacts,
  type TimelineFacts,
} from "@/application/compose-timeline-facts";
import { LunarEventSearch } from "@/application/search-lunar-events";
import { StationEventSearch } from "@/application/search-station-events";
import { TransitEventWindowSearch } from "@/application/search-transit-event-window";
import { PythagoreanNumerology } from "@/domain/numerology/pythagorean";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { ZOLLIKON_NATAL_CHART_DEMO } from "./natal-chart-demo";
import {
  toTimelineReadModel,
  type TimelineReadModel,
} from "./timeline-read-model";

let cachedFacts: Promise<TimelineFacts> | undefined;
let cachedDemo: Promise<TimelineReadModel> | undefined;
const DEMO_CALCULATED_AT = "2000-04-01T00:00:00.000Z";
const demoNow = () => new Date(DEMO_CALCULATED_AT);

export function getDemoTimeline(): Promise<TimelineReadModel> {
  cachedDemo ??= getDemoTimelineFacts().then(toTimelineReadModel);
  return cachedDemo;
}

export function getDemoTimelineFacts(): Promise<TimelineFacts> {
  cachedFacts ??= buildDemoTimelineFacts();
  return cachedFacts;
}

async function buildDemoTimelineFacts(): Promise<TimelineFacts> {
  const provider = new AstronomyEngineProvider(undefined, demoNow);
  const [transit, lunar, station] = await Promise.all([
    new TransitEventWindowSearch(
      provider,
      DEFAULT_ASPECT_DEFINITIONS,
      demoNow,
    ).search(ZOLLIKON_NATAL_CHART_DEMO, {
      startInstant: "1999-12-15T00:00:00Z",
      endInstant: "2000-01-20T00:00:00Z",
      transitingBody: "venus",
      natalTargetId: "natal:body:mars",
      aspectType: "conjunction",
      coordinateOrigin: "geocentric",
      sampleStepSeconds: 86_400,
      refinementToleranceSeconds: 1,
      maxRefinementIterations: 32,
    }),
    new LunarEventSearch(provider, demoNow).search({
      eventType: "primary-phase",
      phase: "new-moon",
      startInstant: "2000-01-04T00:00:00Z",
      endInstant: "2000-01-09T00:00:00Z",
      coordinateOrigin: "geocentric",
      sampleStepSeconds: 21_600,
      refinementToleranceSeconds: 1,
      maxRefinementIterations: 32,
    }),
    new StationEventSearch(provider, demoNow).search({
      eventType: "station-retrograde",
      body: "mercury",
      startInstant: "2000-02-19T00:00:00Z",
      endInstant: "2000-02-24T00:00:00Z",
      coordinateOrigin: "geocentric",
      sampleStepSeconds: 21_600,
      refinementToleranceSeconds: 1,
      maxRefinementIterations: 32,
    }),
  ]);
  if (!transit.ok || !lunar.ok || !station.ok)
    throw new Error("Local timeline demo calculation failed");
  return composeTimelineFacts(
    {
      interval: {
        startInstant: "1999-12-15T00:00:00Z",
        endInstant: "2000-04-01T00:00:00Z",
      },
      transitEvents: [transit.value],
      lunarEvents: [lunar.value],
      stationEvents: [station.value],
      numerology: {
        birthDate: "1990-07-15",
        boundaries: [
          boundary("personal-year", "2000-01-01", "2000-01-01T05:00:00Z"),
          boundary("personal-month", "2000-02-01", "2000-02-01T05:00:00Z"),
          boundary("personal-day", "2000-02-02", "2000-02-02T05:00:00Z"),
        ],
      },
    },
    new PythagoreanNumerology(),
    demoNow,
  );
}

function boundary(
  kind: "personal-year" | "personal-month" | "personal-day",
  localDate: string,
  instant: string,
) {
  return {
    kind,
    localDate,
    instant,
    timezone: "America/Toronto",
    timezoneSource: "local sourced demo IANA boundary",
  } as const;
}
