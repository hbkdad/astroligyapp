import { describe, expect, it, vi } from "vitest";

import {
  NatalChartEngine,
  type NatalChart,
  type NatalChartInput,
} from "@/application/calculate-natal-chart";
import {
  TRANSIT_SNAPSHOT_ENGINE_VERSION,
  TransitSnapshotEngine,
  type TransitSnapshotInput,
} from "@/application/calculate-transit-snapshot";
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

const NATAL_INSTANT = "1997-09-30T14:00:00Z";
const CURRENT_INSTANT = "2000-01-01T12:00:00Z";
const NATAL_LONGITUDES = [0, 60, 90, 120, 180, 210, 240, 270, 300, 330];
const CURRENT_LONGITUDES = [359, 1, 30, 61, 89, 121, 179, 241, 301, 240];

const NATAL_INPUT: NatalChartInput = {
  instant: NATAL_INSTANT,
  timezone: "UTC",
  timezoneSource: "fixture instant published in UTC",
  observer: { latitudeDegrees: 47.33, longitudeDegrees: 8.58 },
  coordinateSource: "fixture observer",
  coordinateOrigin: "topocentric",
  houseSystem: "whole-sign",
};

const TRANSIT_INPUT: TransitSnapshotInput = {
  instant: CURRENT_INSTANT,
  observer: { latitudeDegrees: 51.4779, longitudeDegrees: 0 },
  coordinateSource: "fixture current observer",
  coordinateOrigin: "topocentric",
};

class TransitFixtureProvider implements EphemerisProvider {
  readonly id = "transit-fixture";

  async getPositions(request: PositionRequest) {
    const longitudes =
      request.instant === NATAL_INSTANT ? NATAL_LONGITUDES : CURRENT_LONGITUDES;
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        positions: request.bodies.map((body) => {
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
          300, 330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270,
        ],
        ascendantLongitudeDegrees: 300,
        midheavenLongitudeDegrees: 240,
        metadata: metadata(this.id, request, "topocentric"),
      },
    };
  }
}

describe("TransitSnapshotEngine", () => {
  it("compares current bodies with stable natal body and angle targets", async () => {
    const provider = new TransitFixtureProvider();
    const natalChart = await calculateNatal(provider);
    const result = await new TransitSnapshotEngine(provider).calculate(
      natalChart,
      TRANSIT_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.input).toEqual(TRANSIT_INPUT);
    expect(result.value.natal).toEqual({
      input: natalChart.input,
      metadata: natalChart.metadata,
    });
    expect(result.value.metadata).toMatchObject({
      transitEngineVersion: TRANSIT_SNAPSHOT_ENGINE_VERSION,
      aspectPolicy: { id: "major-aspects", version: "1.0.0" },
    });
    expect(result.value.aspects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transitingBody: "sun",
          natalTarget: expect.objectContaining({
            id: "natal:body:sun",
            kind: "body",
          }),
          type: "conjunction",
          orbDegrees: 1,
          phase: "applying",
        }),
        expect.objectContaining({
          transitingBody: "moon",
          natalTarget: expect.objectContaining({
            id: "natal:body:sun",
            kind: "body",
          }),
          type: "conjunction",
          orbDegrees: 1,
          phase: "separating",
        }),
        expect.objectContaining({
          transitingBody: "pluto",
          natalTarget: expect.objectContaining({
            id: "natal:angle:ascendant",
            kind: "angle",
          }),
          type: "sextile",
          orbDegrees: 0,
        }),
      ]),
    );
    expect(
      new Set(
        result.value.aspects.map(
          (aspect) => `${aspect.transitingBody}:${aspect.natalTarget.id}`,
        ),
      ).size,
    ).toBe(result.value.aspects.length);
    expect(Object.keys(result.value.aspects[0]!)).not.toEqual(
      expect.arrayContaining(["start", "peak", "end", "score"]),
    );
  });

  it("matches dual-source natal/current fixtures through the real provider", async () => {
    const provider = new AstronomyEngineProvider();
    const natalFixture = fixtureCase("swiss-whole-sign-zollikon");
    const currentFixture = fixtureCase("j2000-greenwich");
    const natalResult = await new NatalChartEngine(provider).calculate({
      ...NATAL_INPUT,
      instant: natalFixture.manifest.instant,
      observer: natalFixture.manifest.observer,
    });
    expect(natalResult.ok).toBe(true);
    if (!natalResult.ok) return;

    const result = await new TransitSnapshotEngine(provider).calculate(
      natalResult.value,
      {
        ...TRANSIT_INPUT,
        instant: currentFixture.manifest.instant,
        observer: currentFixture.manifest.observer,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const position of result.value.sky.positions) {
      const expected = currentFixture.values.bodies[position.body].expected;
      expect(
        circularDifference(
          position.eclipticLongitudeDegrees,
          expected.eclipticLongitudeDegrees,
        ),
        position.body,
      ).toBeLessThanOrEqual(manifest.tolerances.longitudeDegrees);
    }

    const venusMars = findTransit(
      result.value.aspects,
      "venus",
      "natal:body:mars",
    );
    expect(venusMars).toMatchObject({ type: "conjunction" });
    expect(venusMars!.orbDegrees).toBeCloseTo(0.4103203, 1);
    const neptunePluto = findTransit(
      result.value.aspects,
      "neptune",
      "natal:body:pluto",
    );
    expect(neptunePluto).toMatchObject({ type: "sextile" });
    expect(neptunePluto!.orbDegrees).toBeCloseTo(0.2677861, 1);
  });

  it("returns explicit sky-provider failure without transit facts", async () => {
    const natalChart = await calculateNatal(new TransitFixtureProvider());
    const provider: EphemerisProvider = new TransitFixtureProvider();
    provider.getPositions = async () => ({
      ok: false,
      error: {
        code: "provider-unavailable",
        message: "Current sky unavailable",
        retryable: true,
      },
    });
    await expect(
      new TransitSnapshotEngine(provider).calculate(natalChart, TRANSIT_INPUT),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "provider-unavailable", retryable: true },
    });
  });

  it("supports an explicitly location-free geocentric snapshot", async () => {
    const provider = new TransitFixtureProvider();
    const natalChart = await calculateNatal(provider);
    const result = await new TransitSnapshotEngine(provider).calculate(
      natalChart,
      {
        instant: CURRENT_INSTANT,
        coordinateOrigin: "geocentric",
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.input).toEqual({
      instant: CURRENT_INSTANT,
      coordinateOrigin: "geocentric",
    });
    expect(result.value.sky.metadata.coordinateOrigin).toBe("geocentric");
  });

  it("rejects invalid natal targets before provider dispatch", async () => {
    const provider = new TransitFixtureProvider();
    const natalChart = await calculateNatal(provider);
    const dispatch = vi.spyOn(provider, "getPositions");
    const invalidCharts = [
      { ...natalChart, placements: natalChart.placements.slice(1) },
      {
        ...natalChart,
        placements: [
          natalChart.placements[0]!,
          ...natalChart.placements.slice(0, -1),
        ],
      },
      {
        ...natalChart,
        houses: { ...natalChart.houses, ascendantLongitudeDegrees: 360 },
      },
    ] as readonly NatalChart[];
    for (const invalid of invalidCharts) {
      await expect(
        new TransitSnapshotEngine(provider).calculate(invalid, TRANSIT_INPUT),
      ).rejects.toThrow(RangeError);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    {
      instant: CURRENT_INSTANT,
      observer: { latitudeDegrees: 51.4779, longitudeDegrees: 0 },
      coordinateOrigin: "topocentric" as const,
    },
    { ...TRANSIT_INPUT, coordinateSource: "" },
    { ...TRANSIT_INPUT, coordinateSource: "line one\nline two" },
    {
      instant: CURRENT_INSTANT,
      coordinateOrigin: "geocentric" as const,
      coordinateSource: "unexpected source",
    },
  ])("rejects invalid observer provenance %#", async (invalidInput) => {
    const provider = new TransitFixtureProvider();
    const natalChart = await calculateNatal(provider);
    await expect(
      new TransitSnapshotEngine(provider).calculate(natalChart, invalidInput),
    ).rejects.toThrow(RangeError);
  });
});

async function calculateNatal(
  provider: EphemerisProvider,
): Promise<NatalChart> {
  const result = await new NatalChartEngine(provider).calculate(NATAL_INPUT);
  if (!result.ok) throw new Error("Natal fixture failed");
  return result.value;
}

function fixtureCase(id: string) {
  return {
    manifest: manifest.cases.find((candidate) => candidate.id === id)!,
    values: referenceValues.cases.find((candidate) => candidate.id === id)!,
  };
}

function findTransit(
  aspects: readonly {
    transitingBody: string;
    natalTarget: { id: string };
    type: string;
    orbDegrees: number;
  }[],
  body: string,
  targetId: string,
) {
  return aspects.find(
    (aspect) =>
      aspect.transitingBody === body && aspect.natalTarget.id === targetId,
  );
}

function metadata(
  providerId: string,
  request: Pick<PositionRequest | HouseRequest, "zodiacReference">,
  coordinateOrigin: "geocentric" | "topocentric",
): ProviderMetadata {
  return {
    providerId,
    providerVersion: "fixture-1.0.0",
    dataVersion: "fixture-data-1.0.0",
    calculatedAt: CURRENT_INSTANT,
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
