import { beforeAll, describe, expect, it } from "vitest";

import {
  TIMELINE_FACTS_VERSION,
  TIMELINE_FACT_TYPE_ORDER,
  composeTimelineFacts,
  type TimelineFact,
  type TimelineCompositionInput,
} from "@/application/compose-timeline-facts";
import {
  LUNAR_EVENT_SEARCH_VERSION,
  LunarEventSearch,
  type LunarEventSearchOutput,
} from "@/application/search-lunar-events";
import {
  StationEventSearch,
  type StationEventSearchOutput,
} from "@/application/search-station-events";
import {
  TransitEventWindowSearch,
  type TransitEventWindow,
} from "@/application/search-transit-event-window";
import type { NumerologyStrategy } from "@/domain/numerology/contracts";
import { PythagoreanNumerology } from "@/domain/numerology/pythagorean";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { ZOLLIKON_NATAL_CHART_DEMO } from "@/presentation/natal-chart-demo";

const INTERVAL = {
  startInstant: "1999-12-15T00:00:00Z",
  endInstant: "2000-04-01T00:00:00Z",
};
const NUMEROLOGY = new PythagoreanNumerology();

let transit: TransitEventWindow;
let lunar: LunarEventSearchOutput;
let station: StationEventSearchOutput;

beforeAll(async () => {
  const provider = new AstronomyEngineProvider();
  const transitResult = await new TransitEventWindowSearch(provider).search(
    ZOLLIKON_NATAL_CHART_DEMO,
    {
      startInstant: "1999-12-15T00:00:00Z",
      endInstant: "2000-01-20T00:00:00Z",
      transitingBody: "venus",
      natalTargetId: "natal:body:mars",
      aspectType: "conjunction",
      coordinateOrigin: "geocentric",
      sampleStepSeconds: 86_400,
      refinementToleranceSeconds: 1,
      maxRefinementIterations: 32,
    },
  );
  const lunarResult = await new LunarEventSearch(provider).search({
    eventType: "primary-phase",
    phase: "new-moon",
    startInstant: "2000-01-04T00:00:00Z",
    endInstant: "2000-01-09T00:00:00Z",
    coordinateOrigin: "geocentric",
    sampleStepSeconds: 21_600,
    refinementToleranceSeconds: 1,
    maxRefinementIterations: 32,
  });
  const stationResult = await new StationEventSearch(provider).search({
    eventType: "station-retrograde",
    body: "mercury",
    startInstant: "2000-02-19T00:00:00Z",
    endInstant: "2000-02-24T00:00:00Z",
    coordinateOrigin: "geocentric",
    sampleStepSeconds: 21_600,
    refinementToleranceSeconds: 1,
    maxRefinementIterations: 32,
  });
  if (!transitResult.ok || !lunarResult.ok || !stationResult.ok)
    throw new Error("Timeline source fixture search failed");
  transit = transitResult.value;
  lunar = lunarResult.value;
  station = stationResult.value;
});

describe("composeTimelineFacts", () => {
  it("returns a versioned immutable empty timeline", () => {
    const result = composeTimelineFacts(emptyInput());
    expect(result).toMatchObject({
      version: TIMELINE_FACTS_VERSION,
      interval: INTERVAL,
      facts: [],
      metadata: {
        sourceVersions: {
          transitEventSearch: "1.0.0",
          lunarEventSearch: "1.0.0",
          stationEventSearch: "1.0.0",
        },
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.facts)).toBe(true);
  });

  it("composes one source event as one normalized fact", () => {
    const result = composeTimelineFacts({
      ...emptyInput(),
      lunarEvents: [lunar],
    });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({
      id: lunar.event.id,
      type: "primary-phase",
      occurrence: {
        kind: "instant",
        instant: lunar.event.point.instant,
      },
      sourceVersion: LUNAR_EVENT_SEARCH_VERSION,
      source: lunar,
    });
  });

  it.each([
    { startInstant: INTERVAL.startInstant, endInstant: INTERVAL.startInstant },
    { startInstant: "not-an-instant", endInstant: INTERVAL.endInstant },
  ])("rejects malformed timeline interval %#", (interval) => {
    expect(() => composeTimelineFacts({ ...emptyInput(), interval })).toThrow(
      RangeError,
    );
  });

  it("composes mixed source events without mutating or recalculating them", () => {
    const sourceInput = mixedInput();
    const before = structuredClone(sourceInput);
    const result = composeTimelineFacts(sourceInput, NUMEROLOGY);
    expect(sourceInput).toEqual(before);
    expect(result.facts).toHaveLength(6);
    expect(result.facts.map((fact) => occurrenceTime(fact))).toEqual(
      [...result.facts.map((fact) => occurrenceTime(fact))].sort(
        (left, right) => left - right,
      ),
    );
    expect(
      result.facts.find((fact) => fact.type === "personal-transit")!.source,
    ).toEqual(transit);
    expect(
      result.facts.find((fact) => fact.type === "primary-phase")!.source,
    ).toEqual(lunar);
    expect(
      result.facts.find((fact) => fact.type === "planetary-station")!.source,
    ).toEqual(station);
    expect(Object.isFrozen(result.facts[0]!.source)).toBe(true);
  });

  it("uses explicit type and ID ordering for facts at the same instant", () => {
    const instant = "2000-01-01T05:00:00Z";
    const result = composeTimelineFacts(
      {
        ...emptyInput(),
        numerology: {
          birthDate: "1990-07-15",
          boundaries: [
            boundary("personal-day", "2000-01-01", instant),
            boundary("personal-month", "2000-01-01", instant),
            boundary("personal-year", "2000-01-01", instant),
          ],
        },
      },
      NUMEROLOGY,
    );
    expect(result.facts.map((fact) => fact.type)).toEqual([
      "personal-year-boundary",
      "personal-month-boundary",
      "personal-day-boundary",
    ]);
    expect(
      result.facts.map((fact) => TIMELINE_FACT_TYPE_ORDER.indexOf(fact.type)),
    ).toEqual([4, 5, 6]);
  });

  it("calculates traced Pythagorean cycle values only at supplied boundaries", () => {
    const result = composeTimelineFacts(
      {
        ...emptyInput(),
        numerology: {
          birthDate: "1990-07-15",
          boundaries: [
            boundary("personal-year", "2000-01-01", "2000-01-01T05:00:00Z"),
            boundary("personal-month", "2000-02-01", "2000-02-01T05:00:00Z"),
            boundary("personal-day", "2000-02-02", "2000-02-02T05:00:00Z"),
          ],
        },
      },
      NUMEROLOGY,
    );
    for (const fact of result.facts) {
      if (
        fact.type !== "personal-year-boundary" &&
        fact.type !== "personal-month-boundary" &&
        fact.type !== "personal-day-boundary"
      )
        continue;
      expect(fact.source.result).toMatchObject({
        strategyId: "pythagorean",
        strategyVersion: "1.0.0",
      });
      expect(fact.source.result.tokens.length).toBeGreaterThan(0);
      expect(fact.source.result.trace.length).toBeGreaterThan(0);
      expect(fact.source.request).toMatchObject({
        timezone: "America/Toronto",
        timezoneSource: "fixture-resolved IANA local midnight",
      });
    }
    expect(result.metadata.sourceVersions.numerologyStrategy).toEqual({
      id: "pythagorean",
      version: "1.0.0",
    });
  });

  it("requires strategy and numerology input together", () => {
    expect(() =>
      composeTimelineFacts({
        ...emptyInput(),
        numerology: { birthDate: "1990-07-15", boundaries: [] },
      }),
    ).toThrow("explicit strategy");
    expect(() => composeTimelineFacts(emptyInput(), NUMEROLOGY)).toThrow(
      "requires boundary input",
    );
  });

  it.each([
    boundary("personal-month", "2000-02-02", "2000-02-02T05:00:00Z"),
    boundary("personal-year", "2000-02-01", "2000-02-01T05:00:00Z"),
    boundary("personal-day", "2000-02-30", "2000-02-02T05:00:00Z"),
    {
      ...boundary("personal-day", "2000-02-02", "2000-02-02T05:00:00Z"),
      timezone: "Mars/Base",
    },
    {
      ...boundary("personal-day", "2000-02-02", "2000-02-02T05:00:00Z"),
      timezoneSource: "",
    },
    boundary("personal-day", "2000-02-02", "2000-02-02T06:00:00Z"),
    {
      ...boundary("personal-day", "2000-02-02", "2000-02-02T05:00:00Z"),
      kind: "personal-week" as "personal-day",
    },
  ])("rejects malformed numerology boundary %#", (invalidBoundary) => {
    expect(() =>
      composeTimelineFacts(
        {
          ...emptyInput(),
          numerology: {
            birthDate: "1990-07-15",
            boundaries: [invalidBoundary],
          },
        },
        NUMEROLOGY,
      ),
    ).toThrow(RangeError);
  });

  it("uses a half-open display interval for every event shape", () => {
    const outOfRange = structuredClone(lunar);
    outOfRange.event.point.instant = INTERVAL.endInstant;
    expect(() =>
      composeTimelineFacts({ ...emptyInput(), lunarEvents: [outOfRange] }),
    ).toThrow("outside the timeline interval");
    expect(() =>
      composeTimelineFacts(
        {
          ...emptyInput(),
          numerology: {
            birthDate: "1990-07-15",
            boundaries: [
              boundary("personal-day", "2000-04-01", INTERVAL.endInstant),
            ],
          },
        },
        NUMEROLOGY,
      ),
    ).toThrow("outside the timeline interval");
  });

  it("rejects duplicate IDs across otherwise valid inputs", () => {
    expect(() =>
      composeTimelineFacts({ ...emptyInput(), lunarEvents: [lunar, lunar] }),
    ).toThrow("must be unique");
  });

  it.each([
    (input: TimelineCompositionInput) => {
      (
        input.transitEvents[0] as unknown as {
          metadata: { searchEngineVersion: string };
        }
      ).metadata.searchEngineVersion = "0.9.0";
    },
    (input: TimelineCompositionInput) => {
      (input.transitEvents[0] as TransitEventWindow).event.peak.instant = (
        input.transitEvents[0] as TransitEventWindow
      ).event.start.instant;
    },
    (input: TimelineCompositionInput) => {
      (input.lunarEvents[0] as unknown as { event: { id: string } }).event.id =
        "wrong";
    },
    (input: TimelineCompositionInput) => {
      (input.stationEvents[0] as StationEventSearchOutput).input.eventType =
        "station-direct";
    },
    (input: TimelineCompositionInput) => {
      const mutable = input.stationEvents[0] as unknown as {
        metadata: { searchPolicy: { evaluationCount: number } };
      };
      mutable.metadata.searchPolicy.evaluationCount += 1;
    },
  ])("rejects malformed or cross-version source event %#", (mutate) => {
    const input = mixedInput();
    mutate(input);
    expect(() => composeTimelineFacts(input, NUMEROLOGY)).toThrow(RangeError);
  });

  it("rejects a strategy that returns mismatched trace metadata", () => {
    const badStrategy = Object.create(NUMEROLOGY) as NumerologyStrategy;
    badStrategy.calculatePersonalDay = (...args) => ({
      ...NUMEROLOGY.calculatePersonalDay(...args),
      strategyVersion: "wrong",
    });
    expect(() =>
      composeTimelineFacts(
        {
          ...emptyInput(),
          numerology: {
            birthDate: "1990-07-15",
            boundaries: [
              boundary("personal-day", "2000-02-02", "2000-02-02T05:00:00Z"),
            ],
          },
        },
        badStrategy,
      ),
    ).toThrow("Invalid numerology boundary result");
  });
});

function emptyInput(): TimelineCompositionInput {
  return {
    interval: INTERVAL,
    transitEvents: [],
    lunarEvents: [],
    stationEvents: [],
  };
}

function mixedInput(): TimelineCompositionInput {
  return {
    interval: INTERVAL,
    transitEvents: [structuredClone(transit)],
    lunarEvents: [structuredClone(lunar)],
    stationEvents: [structuredClone(station)],
    numerology: {
      birthDate: "1990-07-15",
      boundaries: [
        boundary("personal-year", "2000-01-01", "2000-01-01T05:00:00Z"),
        boundary("personal-month", "2000-02-01", "2000-02-01T05:00:00Z"),
        boundary("personal-day", "2000-02-02", "2000-02-02T05:00:00Z"),
      ],
    },
  };
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
    timezoneSource: "fixture-resolved IANA local midnight",
  } as const;
}

function occurrenceTime(fact: TimelineFact): number {
  return Date.parse(
    fact.occurrence.kind === "instant"
      ? fact.occurrence.instant!
      : fact.occurrence.startInstant!,
  );
}
