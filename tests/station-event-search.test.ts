import { describe, expect, it, vi } from "vitest";

import {
  STATION_EVENT_SEARCH_VERSION,
  StationEventSearch,
  type StationEventSearchInput,
  type StationEventType,
} from "@/application/search-station-events";
import type {
  EphemerisProvider,
  PositionRequest,
  ProviderMetadata,
} from "@/domain/astro/contracts";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import sourceFixture from "./fixtures/ephemeris/mercury-stations-2000.json";

const START = "2000-01-01T00:00:00Z";
const DAY_MS = 86_400_000;

class MotionProvider implements EphemerisProvider {
  readonly id = "motion-fixture";
  dispatches = 0;
  fail = false;
  omitSpeed = false;
  inconsistentTrace = false;

  constructor(
    private readonly speedAtDay: (day: number) => number,
    private readonly longitudeAtDay: (day: number) => number,
  ) {}

  async getPositions(request: PositionRequest) {
    this.dispatches += 1;
    if (this.fail)
      return {
        ok: false as const,
        error: {
          code: "provider-unavailable" as const,
          message: "Motion fixture unavailable",
          retryable: true,
        },
      };
    const day = (Date.parse(request.instant) - Date.parse(START)) / DAY_MS;
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        positions: request.bodies.map((body) => ({
          body,
          eclipticLongitudeDegrees: normalize(this.longitudeAtDay(day)),
          ...(this.omitSpeed
            ? {}
            : { speedLongitudeDegreesPerDay: this.speedAtDay(day) }),
        })),
        metadata: metadata(
          request,
          this.inconsistentTrace && this.dispatches > 1
            ? "fixture-2.0.0"
            : "fixture-1.0.0",
        ),
      },
    };
  }

  async getHouseCusps() {
    return {
      ok: false as const,
      error: {
        code: "unsupported-capability" as const,
        message: "Houses are outside the motion fixture",
        retryable: false,
      },
    };
  }
}

describe("StationEventSearch", () => {
  it.each([
    ["station-retrograde", (day: number) => 2.3 - day, "direct", "retrograde"],
    ["station-direct", (day: number) => day - 2.3, "retrograde", "direct"],
  ] as const)(
    "refines a hand-checkable %s speed crossing",
    async (eventType, speedAtDay, motionBefore, motionAfter) => {
      const provider = new MotionProvider(
        speedAtDay,
        (day) => 100 + 2.3 * day - 0.5 * day * day,
      );
      const result = await new StationEventSearch(provider).search(
        searchInput(eventType),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        secondsFromDay(result.value.event.instant, 2.3),
      ).toBeLessThanOrEqual(1);
      expect(result.value.event).toMatchObject({
        type: eventType,
        body: "mercury",
        motionBefore,
        motionAfter,
      });
      expect(
        Math.abs(result.value.event.speedLongitudeDegreesPerDay),
      ).toBeLessThan(0.00002);
      expect(
        result.value.event.bracket.beforeSpeedLongitudeDegreesPerDay,
      ).not.toBe(0);
      expect(
        result.value.event.bracket.afterSpeedLongitudeDegreesPerDay,
      ).not.toBe(0);
    },
  );

  it("retains every provider trace and deeply freezes output", async () => {
    const provider = new MotionProvider(
      (day) => 2.3 - day,
      (day) => 100 + 2.3 * day - 0.5 * day * day,
    );
    const result = await new StationEventSearch(provider).search(
      searchInput("station-retrograde"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metadata).toMatchObject({
      searchEngineVersion: STATION_EVENT_SEARCH_VERSION,
      provider: {
        providerId: "motion-fixture",
        providerVersion: "fixture-1.0.0",
      },
      searchPolicy: {
        initialSampleCount: 6,
        sampleStepSeconds: 86_400,
        refinementToleranceSeconds: 1,
      },
    });
    expect(result.value.metadata.searchPolicy.evaluationCount).toBe(
      result.value.metadata.evaluations.length,
    );
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.metadata.evaluations)).toBe(true);
  });

  it.each(sourceFixture.events)(
    "matches independent $eventType Mercury fixture at $expectedInstant",
    async (fixture) => {
      const expected = Date.parse(fixture.expectedInstant);
      const result = await new StationEventSearch(
        new AstronomyEngineProvider(),
      ).search({
        eventType: fixture.eventType as StationEventType,
        body: "mercury",
        startInstant: new Date(expected - 2 * DAY_MS).toISOString(),
        endInstant: new Date(expected + 2 * DAY_MS).toISOString(),
        coordinateOrigin: "geocentric",
        sampleStepSeconds: 21_600,
        refinementToleranceSeconds: 1,
        maxRefinementIterations: 32,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        Math.abs(Date.parse(result.value.event.instant) - expected) / 1_000,
      ).toBeLessThanOrEqual(sourceFixture.toleranceSeconds);
      expect(
        circularDifference(
          result.value.event.longitudeDegrees,
          fixture.expectedLongitudeDegrees,
        ),
      ).toBeLessThanOrEqual(sourceFixture.longitudeToleranceDegrees);
      expect(result.value.metadata.provider).toMatchObject({
        providerId: "astronomy-engine",
        providerVersion: "2.1.19",
      });
    },
  );

  it("supports explicit topocentric station provenance", async () => {
    const provider = new MotionProvider(
      (day) => day - 2.3,
      (day) => 100 + 0.5 * (day - 2.3) ** 2,
    );
    const result = await new StationEventSearch(provider).search({
      ...searchInput("station-direct"),
      coordinateOrigin: "topocentric",
      observer: { latitudeDegrees: 47.33, longitudeDegrees: 8.58 },
      coordinateSource: "published Zollikon fixture coordinates",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.input.coordinateOrigin).toBe("topocentric");
  });

  it("rejects invalid requests before provider dispatch", async () => {
    const provider = new MotionProvider(
      (day) => 2.3 - day,
      () => 100,
    );
    const dispatch = vi.spyOn(provider, "getPositions");
    const invalidInputs: readonly StationEventSearchInput[] = [
      { ...searchInput("station-retrograde"), body: "sun" },
      { ...searchInput("station-retrograde"), body: "moon" },
      { ...searchInput("station-retrograde"), endInstant: START },
      {
        ...searchInput("station-retrograde"),
        startInstant: "2000-02-30T00:00:00Z",
      },
      { ...searchInput("station-retrograde"), sampleStepSeconds: 299 },
      {
        ...searchInput("station-retrograde"),
        refinementToleranceSeconds: 86_400,
      },
      { ...searchInput("station-retrograde"), maxRefinementIterations: 0 },
      {
        ...searchInput("station-retrograde"),
        coordinateOrigin: "topocentric" as const,
      },
      {
        ...searchInput("station-retrograde"),
        eventType: "unknown",
      } as unknown as StationEventSearchInput,
    ];
    for (const input of invalidInputs)
      await expect(
        new StationEventSearch(provider).search(input),
      ).rejects.toThrow(RangeError);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("fails explicitly when longitudinal speed is absent", async () => {
    const provider = new MotionProvider(
      (day) => 2.3 - day,
      () => 100,
    );
    provider.omitSpeed = true;
    const result = await new StationEventSearch(provider).search(
      searchInput("station-retrograde"),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "speed-unavailable", retryable: false },
    });
  });

  it("requires the requested crossing direction and both sides", async () => {
    const reverse = new MotionProvider(
      (day) => day - 2.3,
      () => 100,
    );
    await expect(
      new StationEventSearch(reverse).search(searchInput("station-retrograde")),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "event-not-bracketed" },
    });
    const endpoint = new MotionProvider(
      (day) => -day,
      () => 100,
    );
    await expect(
      new StationEventSearch(endpoint).search(
        searchInput("station-retrograde"),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "event-not-bracketed" },
    });
  });

  it("rejects intervals with multiple matching stations", async () => {
    const provider = new MotionProvider(
      (day) => Math.sin(Math.PI * day),
      () => 100,
    );
    const result = await new StationEventSearch(provider).search({
      ...searchInput("station-retrograde"),
      sampleStepSeconds: 21_600,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "ambiguous-event", retryable: false },
    });
  });

  it("propagates provider failure and trace inconsistency", async () => {
    const unavailable = new MotionProvider(
      (day) => 2.3 - day,
      () => 100,
    );
    unavailable.fail = true;
    await expect(
      new StationEventSearch(unavailable).search(
        searchInput("station-retrograde"),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "provider-unavailable", retryable: true },
    });
    const inconsistent = new MotionProvider(
      (day) => 2.3 - day,
      () => 100,
    );
    inconsistent.inconsistentTrace = true;
    await expect(
      new StationEventSearch(inconsistent).search(
        searchInput("station-retrograde"),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "inconsistent-provider-trace", retryable: false },
    });
  });

  it("fails instead of returning an under-refined station", async () => {
    const provider = new MotionProvider(
      (day) => 2.31 - day,
      () => 100,
    );
    const result = await new StationEventSearch(provider).search({
      ...searchInput("station-retrograde"),
      maxRefinementIterations: 2,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "insufficient-precision", retryable: false },
    });
  });
});

function searchInput(eventType: StationEventType): StationEventSearchInput {
  return {
    eventType,
    body: "mercury",
    startInstant: START,
    endInstant: instantAtDay(5),
    coordinateOrigin: "geocentric",
    sampleStepSeconds: 86_400,
    refinementToleranceSeconds: 1,
    maxRefinementIterations: 32,
  };
}

function metadata(
  request: PositionRequest,
  providerVersion: string,
): ProviderMetadata {
  return {
    providerId: "motion-fixture",
    providerVersion,
    dataVersion: "motion-data-1.0.0",
    calculatedAt: request.instant,
    timeScale: "utc",
    referenceFrame: "ecliptic-of-date",
    zodiacReference: request.zodiacReference,
    coordinateOrigin: request.coordinateOrigin,
  };
}

function instantAtDay(day: number): string {
  return new Date(Date.parse(START) + day * DAY_MS).toISOString();
}

function secondsFromDay(instant: string, day: number): number {
  return (
    Math.abs(Date.parse(instant) - (Date.parse(START) + day * DAY_MS)) / 1_000
  );
}

function normalize(value: number): number {
  return ((value % 360) + 360) % 360;
}

function circularDifference(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}
