import { describe, expect, it } from "vitest";

import type { CelestialBody } from "@/domain/astro/contracts";
import {
  getValidatedPositions,
  validatePositionResult,
} from "@/domain/astro/provider-validation";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import {
  CONFORMANCE_POSITION_REQUEST,
  describeEphemerisProviderConformance,
} from "./support/ephemeris-provider-conformance";
import manifest from "./fixtures/ephemeris/reference-cases.json";
import referenceValues from "./fixtures/ephemeris/reference-values.json";

describeEphemerisProviderConformance(
  "Astronomy Engine 2.1.19",
  () => new AstronomyEngineProvider(),
  { houses: "unsupported" },
);

describe("AstronomyEngineProvider", () => {
  it("records independent JPL acceptance and rejection evidence", async () => {
    for (const referenceCase of referenceValues.cases) {
      const fixture = manifest.cases.find(
        (candidate) => candidate.id === referenceCase.id,
      );
      expect(fixture).toBeDefined();
      if (!fixture) continue;
      const bodies = Object.keys(referenceCase.bodies) as CelestialBody[];
      const provider = new AstronomyEngineProvider();
      const result = await getValidatedPositions(provider, {
        instant: referenceCase.instant,
        bodies,
        observer: fixture.observer,
        zodiacReference: "tropical",
        coordinateOrigin: "topocentric",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      for (const actual of result.value.positions) {
        const expected = referenceCase.bodies[actual.body].expected;
        expect(
          circularDifference(
            actual.eclipticLongitudeDegrees,
            expected.eclipticLongitudeDegrees,
          ),
          `${referenceCase.id}/${actual.body} longitude`,
        ).toBeLessThanOrEqual(manifest.tolerances.longitudeDegrees);
        expect(
          Math.abs(
            actual.eclipticLatitudeDegrees! - expected.eclipticLatitudeDegrees,
          ),
          `${referenceCase.id}/${actual.body} latitude`,
        ).toBeLessThanOrEqual(manifest.tolerances.latitudeDegrees);
        expect(
          Math.abs(
            actual.speedLongitudeDegreesPerDay! -
              expected.speedLongitudeDegreesPerDay,
          ),
          `${referenceCase.id}/${actual.body} speed`,
        ).toBeLessThanOrEqual(manifest.tolerances.speedLongitudeDegreesPerDay);
        expect(actual.distanceAu).toBeUndefined();
      }
    }
  });

  it("returns explicit unsupported errors for sidereal requests", async () => {
    const provider = new AstronomyEngineProvider();
    await expect(
      getValidatedPositions(provider, {
        ...CONFORMANCE_POSITION_REQUEST,
        zodiacReference: "sidereal",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unsupported-capability", retryable: false },
    });
  });

  it("produces a distinct valid topocentric Moon position", async () => {
    const provider = new AstronomyEngineProvider();
    const geocentricRequest = {
      ...CONFORMANCE_POSITION_REQUEST,
      bodies: ["moon"] as const,
    };
    const topocentricRequest = {
      ...geocentricRequest,
      coordinateOrigin: "topocentric" as const,
      observer: {
        latitudeDegrees: 43.6532,
        longitudeDegrees: -79.3832,
        elevationMeters: 76,
      },
    };
    const geocentric = await provider.getPositions(geocentricRequest);
    const topocentric = await provider.getPositions(topocentricRequest);
    expect(geocentric.ok).toBe(true);
    expect(topocentric.ok).toBe(true);
    if (!geocentric.ok || !topocentric.ok) return;
    validatePositionResult(provider.id, geocentricRequest, geocentric.value);
    validatePositionResult(provider.id, topocentricRequest, topocentric.value);
    expect(
      topocentric.value.positions[0]!.eclipticLongitudeDegrees,
    ).not.toBeCloseTo(
      geocentric.value.positions[0]!.eclipticLongitudeDegrees,
      6,
    );
  });

  it("does not report a silent result for an invalid date when called directly", async () => {
    const provider = new AstronomyEngineProvider();
    await expect(
      provider.getPositions({
        ...CONFORMANCE_POSITION_REQUEST,
        instant: "not-a-date",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "data-unavailable" },
    });
  });
});

function circularDifference(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}
