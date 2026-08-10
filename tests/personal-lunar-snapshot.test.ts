import { describe, expect, it } from "vitest";

import {
  NatalChartEngine,
  type NatalChartInput,
} from "@/application/calculate-natal-chart";
import {
  TransitSnapshotEngine,
  type TransitSnapshot,
  type TransitSnapshotInput,
} from "@/application/calculate-transit-snapshot";
import {
  derivePersonalLunarSnapshot,
  PERSONAL_LUNAR_SNAPSHOT_VERSION,
} from "@/application/derive-personal-lunar-snapshot";
import {
  CELESTIAL_BODIES,
  type EphemerisProvider,
  type HouseRequest,
  type PositionRequest,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { LUNAR_PHASE_ENGINE_VERSION } from "@/domain/lunar/phase";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import manifest from "./fixtures/ephemeris/reference-cases.json";
import referenceValues from "./fixtures/ephemeris/reference-values.json";

const NATAL_INSTANT = "1997-09-30T14:00:00Z";
const CURRENT_INSTANT = "2000-01-01T12:00:00Z";
const NATAL_INPUT: NatalChartInput = {
  instant: NATAL_INSTANT,
  timezone: "UTC",
  timezoneSource: "fixture instant published in UTC",
  observer: { latitudeDegrees: 47.33, longitudeDegrees: 8.58 },
  coordinateSource: "fixture natal observer",
  coordinateOrigin: "topocentric",
  houseSystem: "whole-sign",
};
const CURRENT_INPUT: TransitSnapshotInput = {
  instant: CURRENT_INSTANT,
  observer: { latitudeDegrees: 51.4779, longitudeDegrees: 0 },
  coordinateSource: "fixture current observer",
  coordinateOrigin: "topocentric",
};

class LunarSnapshotFixtureProvider implements EphemerisProvider {
  readonly id = "personal-lunar-fixture";

  async getPositions(request: PositionRequest) {
    const current = [350, 10, 40, 70, 100, 130, 160, 190, 220, 250];
    const natal = [0, 60, 90, 120, 180, 210, 240, 270, 300, 330];
    const longitudes = request.instant === CURRENT_INSTANT ? current : natal;
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

describe("derivePersonalLunarSnapshot", () => {
  it("derives phase and reuses only Moon-to-natal transit facts", async () => {
    const transit = await calculateTransit(new LunarSnapshotFixtureProvider());
    const result = derivePersonalLunarSnapshot(transit);

    expect(result.input).toBe(transit.input);
    expect(result.moon).toBe(
      transit.sky.positions.find((position) => position.body === "moon"),
    );
    expect(result.phase).toMatchObject({
      phase: "new-moon",
      phaseAngleDegrees: 20,
      illuminationTrend: "waxing",
      moonZodiac: { sign: "aries" },
    });
    expect(result.natalAspects).toEqual(
      transit.aspects.filter((aspect) => aspect.transitingBody === "moon"),
    );
    expect(
      result.natalAspects.every((aspect) => aspect.transitingBody === "moon"),
    ).toBe(true);
    expect(result.provenance).toMatchObject({
      personalLunarVersion: PERSONAL_LUNAR_SNAPSHOT_VERSION,
      lunarPhaseEngineVersion: LUNAR_PHASE_ENGINE_VERSION,
      transitEngineVersion: transit.metadata.transitEngineVersion,
      currentSkyProvider: transit.sky.metadata,
      natal: transit.natal,
    });
  });

  it("matches the stored JPL Sun/Moon phase geometry without another provider call", async () => {
    const fixture = fixtureCase("j2000-greenwich");
    const transit = await calculateTransit(new AstronomyEngineProvider());
    const result = derivePersonalLunarSnapshot(transit);
    const expectedAngle = normalize(
      fixture.values.bodies.moon.expected.eclipticLongitudeDegrees -
        fixture.values.bodies.sun.expected.eclipticLongitudeDegrees,
    );

    expect(
      circularDifference(result.phase.phaseAngleDegrees, expectedAngle),
    ).toBeLessThanOrEqual(manifest.tolerances.longitudeDegrees * 2);
    expect(result.phase).toMatchObject({
      phase: "waning-crescent",
      illuminationTrend: "waning",
      moonZodiac: { sign: "scorpio" },
    });
    expect(result.input.instant).toBe(fixture.manifest.instant);
  });

  it.each([
    (snapshot: TransitSnapshot) => ({
      ...snapshot,
      sky: { ...snapshot.sky, instant: "2001-01-01T00:00:00Z" },
    }),
    (snapshot: TransitSnapshot) => ({
      ...snapshot,
      sky: {
        ...snapshot.sky,
        positions: snapshot.sky.positions.filter(
          (position) => position.body !== "sun",
        ),
      },
    }),
    (snapshot: TransitSnapshot) => ({
      ...snapshot,
      sky: {
        ...snapshot.sky,
        positions: [
          ...snapshot.sky.positions,
          snapshot.sky.positions.find((position) => position.body === "moon")!,
        ],
      },
    }),
  ])("rejects inconsistent transit snapshot %#", async (mutate) => {
    const transit = await calculateTransit(new LunarSnapshotFixtureProvider());
    expect(() => derivePersonalLunarSnapshot(mutate(transit))).toThrow(
      RangeError,
    );
  });
});

async function calculateTransit(
  provider: EphemerisProvider,
): Promise<TransitSnapshot> {
  const natalFixture = fixtureCase("swiss-whole-sign-zollikon");
  const currentFixture = fixtureCase("j2000-greenwich");
  const natal = await new NatalChartEngine(provider).calculate({
    ...NATAL_INPUT,
    instant: natalFixture.manifest.instant,
    observer: natalFixture.manifest.observer,
  });
  if (!natal.ok) throw new Error("Natal fixture failed");
  const transit = await new TransitSnapshotEngine(provider).calculate(
    natal.value,
    {
      ...CURRENT_INPUT,
      instant: currentFixture.manifest.instant,
      observer: currentFixture.manifest.observer,
    },
  );
  if (!transit.ok) throw new Error("Transit fixture failed");
  return transit.value;
}

function fixtureCase(id: string) {
  return {
    manifest: manifest.cases.find((candidate) => candidate.id === id)!,
    values: referenceValues.cases.find((candidate) => candidate.id === id)!,
  };
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

function normalize(value: number): number {
  return ((value % 360) + 360) % 360;
}

function circularDifference(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}
