import { describe, expect, it, vi } from "vitest";

import {
  NatalChartEngine,
  type NatalChart,
  type NatalChartInput,
} from "@/application/calculate-natal-chart";
import {
  TRANSIT_EVENT_SEARCH_VERSION,
  TransitEventWindowSearch,
  type TransitEventSearchInput,
} from "@/application/search-transit-event-window";
import type { AspectDefinition } from "@/domain/astro/aspects";
import {
  CELESTIAL_BODIES,
  type EphemerisProvider,
  type HouseRequest,
  type PositionRequest,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { ZOLLIKON_NATAL_CHART_DEMO } from "@/presentation/natal-chart-demo";

const NATAL_INSTANT = "1997-09-30T14:00:00Z";
const SEARCH_START = "2000-01-01T00:00:00Z";
const DAY_MILLISECONDS = 86_400_000;
const NATAL_SUN_LONGITUDE = 100;

const NATAL_INPUT: NatalChartInput = {
  instant: NATAL_INSTANT,
  timezone: "UTC",
  timezoneSource: "hand-checkable UTC fixture",
  observer: { latitudeDegrees: 0, longitudeDegrees: 0 },
  coordinateSource: "hand-checkable zero-coordinate fixture",
  coordinateOrigin: "topocentric",
  houseSystem: "whole-sign",
};

const SEARCH_INPUT: TransitEventSearchInput = {
  startInstant: SEARCH_START,
  endInstant: instantAtDay(11),
  transitingBody: "sun",
  natalTargetId: "natal:body:sun",
  aspectType: "conjunction",
  coordinateOrigin: "geocentric",
  sampleStepSeconds: 86_400,
  refinementToleranceSeconds: 1,
  maxRefinementIterations: 32,
};

class TrajectoryProvider implements EphemerisProvider {
  readonly id = "trajectory-fixture";
  searchDispatches = 0;
  failSearch = false;
  inconsistentTrace = false;

  constructor(
    private readonly trajectory: (day: number) => number = (day) =>
      NATAL_SUN_LONGITUDE - 11 + 2 * day,
    private readonly natalSunLongitude = NATAL_SUN_LONGITUDE,
  ) {}

  async getPositions(request: PositionRequest) {
    const natalRequest =
      request.instant === NATAL_INSTANT &&
      request.bodies.length === CELESTIAL_BODIES.length;
    if (!natalRequest) {
      this.searchDispatches += 1;
      if (this.failSearch) {
        return {
          ok: false as const,
          error: {
            code: "provider-unavailable" as const,
            message: "Trajectory fixture unavailable",
            retryable: true,
          },
        };
      }
    }
    const day =
      (Date.parse(request.instant) - Date.parse(SEARCH_START)) /
      DAY_MILLISECONDS;
    const longitudes = [
      this.natalSunLongitude,
      20,
      40,
      60,
      80,
      120,
      160,
      200,
      240,
      280,
    ];
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        positions: request.bodies.map((body) => ({
          body,
          eclipticLongitudeDegrees: normalize(
            natalRequest
              ? longitudes[CELESTIAL_BODIES.indexOf(body)]!
              : this.trajectory(day),
          ),
          speedLongitudeDegreesPerDay: 2,
        })),
        metadata: metadata(
          request,
          this.inconsistentTrace && this.searchDispatches > 1
            ? "fixture-2.0.0"
            : "fixture-1.0.0",
        ),
      },
    };
  }

  async getHouseCusps(request: HouseRequest) {
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        cuspsLongitudeDegrees: [
          0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330,
        ],
        ascendantLongitudeDegrees: 0,
        midheavenLongitudeDegrees: 270,
        metadata: metadata(request, "fixture-1.0.0", "topocentric"),
      },
    };
  }
}

describe("TransitEventWindowSearch", () => {
  it("refines a complete hand-checkable event and retains every source trace", async () => {
    const provider = new TrajectoryProvider();
    const natalChart = await calculateNatal(provider);
    const result = await new TransitEventWindowSearch(provider).search(
      natalChart,
      SEARCH_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      secondsFromDay(result.value.event.start.instant, 1.5),
    ).toBeLessThanOrEqual(1);
    expect(
      secondsFromDay(result.value.event.peak.instant, 5.5),
    ).toBeLessThanOrEqual(1);
    expect(
      secondsFromDay(result.value.event.end.instant, 9.5),
    ).toBeLessThanOrEqual(1);
    expect(result.value.event).toMatchObject({
      id: `transit:sun:natal:body:sun:conjunction:${result.value.event.peak.instant}`,
      transitingBody: "sun",
      natalTarget: { id: "natal:body:sun", longitudeDegrees: 100 },
      aspect: {
        type: "conjunction",
        exactAngleDegrees: 0,
        maximumOrbDegrees: 8,
      },
      peak: { orbDegrees: 0, normalizedStrength: 1 },
    });
    expect(result.value.metadata).toMatchObject({
      searchEngineVersion: TRANSIT_EVENT_SEARCH_VERSION,
      provider: {
        providerId: "trajectory-fixture",
        providerVersion: "fixture-1.0.0",
      },
      searchPolicy: {
        initialSampleCount: 12,
        sampleStepSeconds: 86_400,
        refinementToleranceSeconds: 1,
      },
    });
    expect(result.value.metadata.searchPolicy.evaluationCount).toBe(
      result.value.metadata.evaluations.length,
    );
    expect(result.value.metadata.evaluations.length).toBeGreaterThan(12);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.metadata.evaluations)).toBe(true);
  });

  it("finds an exact conjunction through the 359-to-0 degree wrap", async () => {
    const provider = new TrajectoryProvider((day) => 348 + 2 * day, 359);
    const natalChart = await calculateNatal(provider);
    const result = await new TransitEventWindowSearch(provider).search(
      natalChart,
      SEARCH_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      secondsFromDay(result.value.event.peak.instant, 5.5),
    ).toBeLessThanOrEqual(1);
    expect(result.value.event.peak.orbDegrees).toBe(0);
    expect(result.value.event.peak.transitingLongitudeDegrees).toBe(359);
  });

  it("selects and refines the declared square branch", async () => {
    const squareOnly: readonly AspectDefinition[] = [
      { type: "square", exactAngleDegrees: 90, maximumOrbDegrees: 2 },
    ];
    const provider = new TrajectoryProvider(
      (day) => NATAL_SUN_LONGITUDE + 80 + 2 * day,
    );
    const natalChart = await calculateNatal(provider);
    const search = new TransitEventWindowSearch(provider, squareOnly);
    const result = await search.search(natalChart, {
      ...SEARCH_INPUT,
      aspectType: "square",
      endInstant: instantAtDay(10),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      secondsFromDay(result.value.event.start.instant, 4),
    ).toBeLessThanOrEqual(1);
    expect(
      secondsFromDay(result.value.event.peak.instant, 5),
    ).toBeLessThanOrEqual(1);
    expect(
      secondsFromDay(result.value.event.end.instant, 6),
    ).toBeLessThanOrEqual(1);
  });

  it("matches the existing JPL-near J2000 case and refines the real adapter peak", async () => {
    const provider = new AstronomyEngineProvider();
    const result = await new TransitEventWindowSearch(provider).search(
      ZOLLIKON_NATAL_CHART_DEMO,
      {
        startInstant: "1999-12-15T00:00:00Z",
        endInstant: "2000-01-20T00:00:00Z",
        transitingBody: "venus",
        natalTargetId: "natal:body:mars",
        aspectType: "conjunction",
        coordinateOrigin: "topocentric",
        observer: { latitudeDegrees: 51.4779, longitudeDegrees: 0 },
        coordinateSource: "JPL J2000 Greenwich acceptance observer",
        sampleStepSeconds: 86_400,
        refinementToleranceSeconds: 1,
        maxRefinementIterations: 32,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.event.peak.orbDegrees).toBeLessThan(0.001);
    expect(Date.parse(result.value.event.start.instant)).toBeLessThan(
      Date.parse("2000-01-01T12:00:00Z"),
    );
    expect(Date.parse(result.value.event.end.instant)).toBeGreaterThan(
      Date.parse("2000-01-01T12:00:00Z"),
    );
    expect(result.value.metadata.provider).toMatchObject({
      providerId: "astronomy-engine",
      providerVersion: "2.1.19",
    });
  });

  it("rejects malformed requests before search provider dispatch", async () => {
    const provider = new TrajectoryProvider();
    const natalChart = await calculateNatal(provider);
    const dispatch = vi.spyOn(provider, "getPositions");
    dispatch.mockClear();
    const invalidInputs = [
      { ...SEARCH_INPUT, endInstant: SEARCH_INPUT.startInstant },
      { ...SEARCH_INPUT, startInstant: "2000-02-30T00:00:00Z" },
      { ...SEARCH_INPUT, sampleStepSeconds: 59 },
      { ...SEARCH_INPUT, refinementToleranceSeconds: 86_400 },
      { ...SEARCH_INPUT, maxRefinementIterations: 0 },
      {
        ...SEARCH_INPUT,
        coordinateOrigin: "topocentric" as const,
      },
      {
        ...SEARCH_INPUT,
        natalTargetId: "natal:body:unknown",
      } as unknown as TransitEventSearchInput,
    ];
    for (const invalidInput of invalidInputs) {
      await expect(
        new TransitEventWindowSearch(provider).search(natalChart, invalidInput),
      ).rejects.toThrow(RangeError);
    }
    await expect(
      new TransitEventWindowSearch(provider, [
        {
          type: "conjunction",
          exactAngleDegrees: 0,
          maximumOrbDegrees: 0,
        },
      ]).search(natalChart, SEARCH_INPUT),
    ).rejects.toThrow("positive aspect orb");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("fails explicitly when the interval does not contain both event boundaries", async () => {
    const provider = new TrajectoryProvider();
    const natalChart = await calculateNatal(provider);
    const result = await new TransitEventWindowSearch(provider).search(
      natalChart,
      {
        ...SEARCH_INPUT,
        startInstant: instantAtDay(2),
        endInstant: instantAtDay(8),
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "event-not-bracketed",
        message:
          "Search interval must bracket one complete inactive-active-inactive event",
        retryable: false,
      },
    });
  });

  it("fails explicitly when a complete active window never reaches exact", async () => {
    const provider = new TrajectoryProvider(
      (day) => NATAL_SUN_LONGITUDE + 1 + (day - 5) ** 2,
    );
    const natalChart = await calculateNatal(provider);
    const result = await new TransitEventWindowSearch(provider).search(
      natalChart,
      { ...SEARCH_INPUT, endInstant: instantAtDay(10) },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "event-not-bracketed", retryable: false },
    });
  });

  it("rejects intervals containing multiple matching event windows", async () => {
    const provider = new TrajectoryProvider(
      (day) => NATAL_SUN_LONGITUDE - 180 + 36 * day,
    );
    const natalChart = await calculateNatal(provider);
    const result = await new TransitEventWindowSearch(provider).search(
      natalChart,
      {
        ...SEARCH_INPUT,
        endInstant: instantAtDay(20),
        sampleStepSeconds: 21_600,
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "ambiguous-event", retryable: false },
    });
  });

  it("propagates provider failures without returning partial event facts", async () => {
    const provider = new TrajectoryProvider();
    const natalChart = await calculateNatal(provider);
    provider.failSearch = true;
    const result = await new TransitEventWindowSearch(provider).search(
      natalChart,
      SEARCH_INPUT,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "provider-unavailable",
        message: "Trajectory fixture unavailable",
        retryable: true,
      },
    });
  });

  it("fails when provider version trace changes between samples", async () => {
    const provider = new TrajectoryProvider();
    const natalChart = await calculateNatal(provider);
    provider.searchDispatches = 0;
    provider.inconsistentTrace = true;
    const result = await new TransitEventWindowSearch(provider).search(
      natalChart,
      SEARCH_INPUT,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "inconsistent-provider-trace", retryable: false },
    });
  });

  it("fails rather than reporting a boundary outside declared precision", async () => {
    const provider = new TrajectoryProvider(
      (day) => NATAL_SUN_LONGITUDE - 11.3 + 2 * day,
    );
    const natalChart = await calculateNatal(provider);
    const result = await new TransitEventWindowSearch(provider).search(
      natalChart,
      { ...SEARCH_INPUT, maxRefinementIterations: 2 },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "insufficient-precision", retryable: false },
    });
  });
});

async function calculateNatal(
  provider: EphemerisProvider,
): Promise<NatalChart> {
  const result = await new NatalChartEngine(provider).calculate(NATAL_INPUT);
  if (!result.ok) throw new Error("Natal trajectory fixture failed");
  return result.value;
}

function metadata(
  request: Pick<PositionRequest | HouseRequest, "instant" | "zodiacReference"> &
    Partial<Pick<PositionRequest, "coordinateOrigin">>,
  providerVersion: string,
  coordinateOrigin = request.coordinateOrigin ?? "topocentric",
): ProviderMetadata {
  return {
    providerId: "trajectory-fixture",
    providerVersion,
    dataVersion: "trajectory-data-1.0.0",
    calculatedAt: request.instant,
    timeScale: "utc",
    referenceFrame: "ecliptic-of-date",
    zodiacReference: request.zodiacReference,
    coordinateOrigin,
  };
}

function instantAtDay(day: number): string {
  return new Date(
    Date.parse(SEARCH_START) + day * DAY_MILLISECONDS,
  ).toISOString();
}

function secondsFromDay(instant: string, day: number): number {
  return (
    Math.abs(
      Date.parse(instant) - (Date.parse(SEARCH_START) + day * DAY_MILLISECONDS),
    ) / 1_000
  );
}

function normalize(value: number): number {
  return ((value % 360) + 360) % 360;
}
