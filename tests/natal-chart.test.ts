import { describe, expect, it, vi } from "vitest";

import {
  NATAL_ASPECT_POLICY_VERSION,
  NATAL_CHART_ENGINE_VERSION,
  NatalChartEngine,
  type NatalChartInput,
} from "@/application/calculate-natal-chart";
import {
  CELESTIAL_BODIES,
  type EphemerisProvider,
  type HouseRequest,
  type PositionRequest,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import manifest from "./fixtures/ephemeris/reference-cases.json";
import referenceValues from "./fixtures/ephemeris/reference-values.json";
import houseReference from "./fixtures/ephemeris/whole-sign-house-reference.json";

const BASE_INPUT: NatalChartInput = {
  instant: "2000-01-01T12:00:00Z",
  timezone: "UTC",
  timezoneSource: "fixture instant published in UTC",
  observer: {
    latitudeDegrees: 51.4779,
    longitudeDegrees: 0,
    elevationMeters: 46,
  },
  coordinateSource: "JPL fixture geodetic observer",
  coordinateOrigin: "topocentric",
  houseSystem: "whole-sign",
};

class DeterministicNatalProvider implements EphemerisProvider {
  readonly id = "deterministic-natal-fixture";

  async getPositions(request: PositionRequest) {
    const longitudes = [0, 359, 30, 60, 90, 120, 150, 180, 240, 300];
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        positions: [...request.bodies].reverse().map((body) => {
          const index = CELESTIAL_BODIES.indexOf(body);
          return {
            body,
            eclipticLongitudeDegrees: longitudes[index]!,
            speedLongitudeDegreesPerDay: index + 1,
          };
        }),
        metadata: metadata(this.id, request, request.coordinateOrigin),
      },
    };
  }

  async getHouseCusps(request: HouseRequest) {
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        cuspsLongitudeDegrees: [
          330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300,
        ],
        ascendantLongitudeDegrees: 359,
        midheavenLongitudeDegrees: 270,
        metadata: metadata(this.id, request, "topocentric"),
      },
    };
  }
}

describe("NatalChartEngine", () => {
  it("composes stable placements, houses, aspects, inputs, and versions", async () => {
    const result = await new NatalChartEngine(
      new DeterministicNatalProvider(),
    ).calculate(BASE_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.input).toEqual(BASE_INPUT);
    expect(result.value.placements.map((placement) => placement.body)).toEqual(
      CELESTIAL_BODIES,
    );
    expect(result.value.placements.slice(0, 4)).toMatchObject([
      { body: "sun", zodiac: { sign: "aries" }, houseNumber: 2 },
      { body: "moon", zodiac: { sign: "pisces" }, houseNumber: 1 },
      { body: "mercury", zodiac: { sign: "taurus" }, houseNumber: 3 },
      { body: "venus", zodiac: { sign: "gemini" }, houseNumber: 4 },
    ]);
    expect(result.value.aspects[0]).toMatchObject({
      firstBody: "sun",
      secondBody: "moon",
      type: "conjunction",
      orbDegrees: 1,
      phase: "applying",
    });
    expect(
      new Set(
        result.value.aspects.map(
          (aspect) => `${aspect.firstBody}:${aspect.secondBody}`,
        ),
      ).size,
    ).toBe(result.value.aspects.length);
    expect(result.value.metadata).toMatchObject({
      chartEngineVersion: NATAL_CHART_ENGINE_VERSION,
      houseStrategy: { id: "whole-sign", version: "1.0.0" },
      aspectPolicy: { version: NATAL_ASPECT_POLICY_VERSION },
      positionProvider: { providerId: "deterministic-natal-fixture" },
      houseProvider: { providerId: "deterministic-natal-fixture" },
    });
  });

  it("matches the stored JPL placements and Swiss house reference through the real provider", async () => {
    const fixture = manifest.cases.find(
      (candidate) => candidate.id === "swiss-whole-sign-zollikon",
    )!;
    const reference = referenceValues.cases.find(
      (candidate) => candidate.id === fixture.id,
    )!;
    const result = await new NatalChartEngine(
      new AstronomyEngineProvider(),
    ).calculate({
      ...BASE_INPUT,
      instant: fixture.instant,
      observer: fixture.observer,
      coordinateSource: "published Zollikon reference coordinates",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const placement of result.value.placements) {
      const expected = reference.bodies[placement.body].expected;
      expect(
        circularDifference(
          placement.eclipticLongitudeDegrees,
          expected.eclipticLongitudeDegrees,
        ),
        placement.body,
      ).toBeLessThanOrEqual(manifest.tolerances.longitudeDegrees);
      expect(placement.houseNumber).toBeGreaterThanOrEqual(1);
      expect(placement.houseNumber).toBeLessThanOrEqual(12);
    }
    expect(
      circularDifference(
        result.value.houses.ascendantLongitudeDegrees,
        houseReference.case.expected.ascendantLongitudeDegrees,
      ),
    ).toBeLessThanOrEqual(houseReference.toleranceDegrees);
    expect(
      circularDifference(
        result.value.houses.midheavenLongitudeDegrees,
        houseReference.case.expected.midheavenLongitudeDegrees,
      ),
    ).toBeLessThanOrEqual(houseReference.toleranceDegrees);
    expect(result.value.houses.cuspsLongitudeDegrees).toEqual(
      houseReference.case.expected.cuspsLongitudeDegrees,
    );
  });

  it.each([
    { timezone: "not/a-zone" },
    { timezoneSource: "" },
    { coordinateSource: "line one\nline two" },
  ])(
    "rejects invalid provenance before provider dispatch %#",
    async (override) => {
      await expect(
        new NatalChartEngine(new DeterministicNatalProvider()).calculate({
          ...BASE_INPUT,
          ...override,
        }),
      ).rejects.toThrow(RangeError);
    },
  );

  it("preserves an explicit provider failure without fabricating a chart", async () => {
    const provider: EphemerisProvider = new DeterministicNatalProvider();
    provider.getHouseCusps = async () => ({
      ok: false,
      error: {
        code: "data-unavailable",
        message: "House fixture unavailable",
        retryable: false,
      },
    });
    await expect(
      new NatalChartEngine(provider).calculate(BASE_INPUT),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "data-unavailable",
        message: "House fixture unavailable",
        retryable: false,
      },
    });
  });

  it("stops after an explicit position failure", async () => {
    const provider: EphemerisProvider = new DeterministicNatalProvider();
    provider.getPositions = async () => ({
      ok: false,
      error: {
        code: "provider-unavailable",
        message: "Position fixture unavailable",
        retryable: true,
      },
    });
    const houseDispatch = vi.spyOn(provider, "getHouseCusps");
    await expect(
      new NatalChartEngine(provider).calculate(BASE_INPUT),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "provider-unavailable", retryable: true },
    });
    expect(houseDispatch).not.toHaveBeenCalled();
  });

  it("marks aspect phase unknown when provider speeds are absent", async () => {
    const provider: EphemerisProvider = new DeterministicNatalProvider();
    const original = provider.getPositions.bind(provider);
    provider.getPositions = async (request) => {
      const result = await original(request);
      if (!result.ok) return result;
      return {
        ok: true,
        value: {
          ...result.value,
          positions: result.value.positions.map((position) => {
            const withoutSpeed = { ...position };
            delete withoutSpeed.speedLongitudeDegreesPerDay;
            return withoutSpeed;
          }),
        },
      };
    };
    const result = await new NatalChartEngine(provider).calculate(BASE_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.aspects.every((aspect) => aspect.phase === "unknown"),
    ).toBe(true);
  });

  it("rejects an invalid aspect policy before provider dispatch", () => {
    expect(
      () => new NatalChartEngine(new DeterministicNatalProvider(), []),
    ).toThrow(RangeError);
  });
});

function metadata(
  providerId: string,
  request: Pick<PositionRequest | HouseRequest, "zodiacReference">,
  coordinateOrigin: "geocentric" | "topocentric",
): ProviderMetadata {
  return {
    providerId,
    providerVersion: "fixture-1.0.0",
    dataVersion: "fixture-data-1.0.0",
    calculatedAt: "2000-01-01T12:00:00Z",
    timeScale: "utc",
    referenceFrame: "ecliptic-of-date",
    zodiacReference: request.zodiacReference,
    coordinateOrigin,
  };
}

function circularDifference(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}
