import { TransitSnapshotEngine } from "@/application/calculate-transit-snapshot";
import {
  composeTimelineFacts,
  type TimelineFacts,
} from "@/application/compose-timeline-facts";
import {
  derivePersonalLunarSnapshot,
  type PersonalLunarSnapshot,
} from "@/application/derive-personal-lunar-snapshot";
import {
  LunarEventSearch,
  type LunarEventSearchInput,
} from "@/application/search-lunar-events";
import { ZODIAC_SIGNS } from "@/domain/astro/zodiac";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { ZOLLIKON_NATAL_CHART_DEMO } from "./natal-chart-demo";
import { toMoonReadModel, type MoonReadModel } from "./moon-read-model";

export interface DemoMoonSource {
  readonly snapshot: PersonalLunarSnapshot;
  readonly timeline: TimelineFacts;
}

let cachedSource: Promise<DemoMoonSource> | undefined;
let cachedModel: Promise<MoonReadModel> | undefined;

export function getDemoMoon(): Promise<MoonReadModel> {
  cachedModel ??= getDemoMoonSource().then(({ snapshot, timeline }) =>
    toMoonReadModel(snapshot, timeline),
  );
  return cachedModel;
}

export function getDemoMoonSource(): Promise<DemoMoonSource> {
  cachedSource ??= buildDemoMoonSource();
  return cachedSource;
}

async function buildDemoMoonSource(): Promise<DemoMoonSource> {
  const provider = new AstronomyEngineProvider();
  const transit = await new TransitSnapshotEngine(provider).calculate(
    ZOLLIKON_NATAL_CHART_DEMO,
    { instant: "2000-01-01T12:00:00Z", coordinateOrigin: "geocentric" },
  );
  if (!transit.ok) throw new Error("Local Moon snapshot calculation failed");
  const snapshot = derivePersonalLunarSnapshot(transit.value);
  const signIndex = ZODIAC_SIGNS.indexOf(snapshot.phase.moonZodiac.sign);
  const enteredSign = ZODIAC_SIGNS[(signIndex + 1) % ZODIAC_SIGNS.length]!;
  const search = new LunarEventSearch(provider);
  const requests: LunarEventSearchInput[] = [
    {
      eventType: "moon-sign-ingress",
      enteredSign,
      startInstant: "2000-01-01T12:00:00Z",
      endInstant: "2000-01-05T12:00:00Z",
      coordinateOrigin: "geocentric",
      sampleStepSeconds: 21_600,
      refinementToleranceSeconds: 1,
      maxRefinementIterations: 32,
    },
    phase("new-moon", "2000-01-04T00:00:00Z", "2000-01-09T00:00:00Z"),
    phase("first-quarter", "2000-01-12T00:00:00Z", "2000-01-17T00:00:00Z"),
    phase("full-moon", "2000-01-19T00:00:00Z", "2000-01-23T00:00:00Z"),
    phase("third-quarter", "2000-01-26T00:00:00Z", "2000-01-30T12:00:00Z"),
  ];
  const results = await Promise.all(
    requests.map((request) => search.search(request)),
  );
  if (results.some((result) => !result.ok))
    throw new Error("Local upcoming Moon event calculation failed");
  const lunarEvents = results.flatMap((result) =>
    result.ok ? [result.value] : [],
  );
  const timeline = composeTimelineFacts({
    interval: {
      startInstant: "2000-01-01T12:00:00Z",
      endInstant: "2000-02-01T00:00:00Z",
    },
    transitEvents: [],
    lunarEvents,
    stationEvents: [],
  });
  return { snapshot, timeline };
}

function phase(
  phaseName: "new-moon" | "first-quarter" | "full-moon" | "third-quarter",
  startInstant: string,
  endInstant: string,
): LunarEventSearchInput {
  return {
    eventType: "primary-phase",
    phase: phaseName,
    startInstant,
    endInstant,
    coordinateOrigin: "geocentric",
    sampleStepSeconds: 21_600,
    refinementToleranceSeconds: 1,
    maxRefinementIterations: 32,
  };
}
