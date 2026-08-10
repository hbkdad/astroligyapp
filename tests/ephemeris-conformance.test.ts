import { describe, expect, it, vi } from "vitest";

import {
  CELESTIAL_BODIES,
  type CelestialBody,
  type EphemerisProvider,
  type HouseRequest,
  type PositionRequest,
  type PositionResult,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import {
  EphemerisContractViolation,
  getValidatedHouseCusps,
  getValidatedPositions,
  validatePositionRequest,
} from "@/domain/astro/provider-validation";
import {
  CONFORMANCE_HOUSE_REQUEST,
  CONFORMANCE_INSTANT,
  CONFORMANCE_POSITION_REQUEST,
  describeEphemerisProviderConformance,
} from "./support/ephemeris-provider-conformance";

class FixtureProvider implements EphemerisProvider {
  readonly id = "fixture-ephemeris";

  async getPositions(request: PositionRequest) {
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        positions: request.bodies.map((body, index) => ({
          body,
          eclipticLongitudeDegrees: index * 35.9999,
          eclipticLatitudeDegrees: index === 1 ? 5.1 : 0,
          distanceAu: index === 1 ? 0.00257 : index + 0.5,
          speedLongitudeDegreesPerDay: index === 7 ? -0.04 : 0.1 + index,
        })),
        metadata: metadata(this.id, request, request.coordinateOrigin),
      },
    };
  }

  async getHouseCusps(request: HouseRequest) {
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        cuspsLongitudeDegrees: Array.from(
          { length: 12 },
          (_, index) => index * 30,
        ),
        ascendantLongitudeDegrees: 15,
        midheavenLongitudeDegrees: 285,
        metadata: metadata(this.id, request, "topocentric"),
      },
    };
  }
}

describeEphemerisProviderConformance("fixture", () => new FixtureProvider());

describe("ephemeris request validation", () => {
  it.each([
    {
      ...CONFORMANCE_POSITION_REQUEST,
      instant: "2026-01-01T00:00:00-05:00",
    },
    { ...CONFORMANCE_POSITION_REQUEST, instant: "2026-02-30T00:00:00Z" },
    { ...CONFORMANCE_POSITION_REQUEST, bodies: [] },
    {
      ...CONFORMANCE_POSITION_REQUEST,
      bodies: ["sun", "sun"] as const,
    },
    {
      ...CONFORMANCE_POSITION_REQUEST,
      coordinateOrigin: "topocentric" as const,
    },
    {
      ...CONFORMANCE_POSITION_REQUEST,
      observer: { latitudeDegrees: 90.0001, longitudeDegrees: 0 },
    },
  ])("rejects invalid requests before dispatch", async (request) => {
    const provider = new FixtureProvider();
    const dispatch = vi.spyOn(provider, "getPositions");
    expect(() => validatePositionRequest(request)).toThrow(
      EphemerisContractViolation,
    );
    await expect(
      getValidatedPositions(provider, request),
    ).rejects.toBeInstanceOf(EphemerisContractViolation);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("ephemeris response validation", () => {
  it.each([
    ["out-of-range longitude", { eclipticLongitudeDegrees: 360 }],
    ["non-finite latitude", { eclipticLatitudeDegrees: Number.NaN }],
    ["non-positive distance", { distanceAu: 0 }],
    ["non-finite speed", { speedLongitudeDegreesPerDay: Infinity }],
  ])("fails closed for %s", async (_name, override) => {
    const provider = new FixtureProvider();
    provider.getPositions = async (request) => {
      const valid = await new FixtureProvider().getPositions(request);
      return {
        ...valid,
        value: {
          ...valid.value,
          positions: [
            { ...valid.value.positions[0]!, ...override },
            ...valid.value.positions.slice(1),
          ],
        },
      };
    };
    await expect(
      getValidatedPositions(provider, CONFORMANCE_POSITION_REQUEST),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-provider-response", retryable: false },
    });
  });

  it("rejects missing, duplicate, extra, and metadata-mismatched bodies", async () => {
    const mutations = [
      (
        positions: Awaited<
          ReturnType<FixtureProvider["getPositions"]>
        >["value"]["positions"],
      ) => positions.slice(1),
      (
        positions: Awaited<
          ReturnType<FixtureProvider["getPositions"]>
        >["value"]["positions"],
      ) => [positions[0]!, positions[0]!, ...positions.slice(2)],
      (
        positions: Awaited<
          ReturnType<FixtureProvider["getPositions"]>
        >["value"]["positions"],
      ) => [...positions, { ...positions[0]!, body: "ceres" as CelestialBody }],
    ];

    for (const mutate of mutations) {
      const provider = new FixtureProvider();
      provider.getPositions = async (request) => {
        const valid = await new FixtureProvider().getPositions(request);
        return {
          ...valid,
          value: { ...valid.value, positions: mutate(valid.value.positions) },
        };
      };
      await expect(
        getValidatedPositions(provider, CONFORMANCE_POSITION_REQUEST),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid-provider-response" },
      });
    }

    const metadataMismatch = new FixtureProvider();
    metadataMismatch.getPositions = async (request) => {
      const valid = await new FixtureProvider().getPositions(request);
      return {
        ...valid,
        value: {
          ...valid.value,
          metadata: { ...valid.value.metadata, providerId: "wrong-adapter" },
        },
      };
    };
    await expect(
      getValidatedPositions(metadataMismatch, CONFORMANCE_POSITION_REQUEST),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-provider-response" },
    });
  });

  it("translates thrown operational failures without leaking details", async () => {
    const provider = new FixtureProvider();
    provider.getPositions = async () => {
      throw new Error("secret provider diagnostic");
    };
    await expect(
      getValidatedPositions(provider, CONFORMANCE_POSITION_REQUEST),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "provider-unavailable",
        message: "Ephemeris provider unavailable",
        retryable: true,
      },
    });
  });

  it("rejects undocumented provider-specific fields", async () => {
    const provider = new FixtureProvider();
    provider.getPositions = async (request) => {
      const valid = await new FixtureProvider().getPositions(request);
      return {
        ...valid,
        value: {
          ...valid.value,
          metadata: { ...valid.value.metadata, providerPayload: "leak" },
        },
      };
    };
    await expect(
      getValidatedPositions(provider, CONFORMANCE_POSITION_REQUEST),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-provider-response" },
    });
  });

  it("classifies structurally invalid output as an invalid response", async () => {
    const provider: EphemerisProvider = new FixtureProvider();
    provider.getPositions = async () => ({
      ok: true,
      value: null as unknown as PositionResult,
    });
    await expect(
      getValidatedPositions(provider, CONFORMANCE_POSITION_REQUEST),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-provider-response", retryable: false },
    });
  });

  it("preserves valid explicit provider failures", async () => {
    const provider: EphemerisProvider = new FixtureProvider();
    provider.getPositions = async () => ({
      ok: false,
      error: {
        code: "unsupported-capability",
        message: "Sidereal positions are not supported",
        retryable: false,
      },
    });
    await expect(
      getValidatedPositions(provider, CONFORMANCE_POSITION_REQUEST),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unsupported-capability", retryable: false },
    });
  });

  it("rejects malformed house output", async () => {
    const provider = new FixtureProvider();
    provider.getHouseCusps = async (request) => {
      const valid = await new FixtureProvider().getHouseCusps(request);
      return {
        ...valid,
        value: { ...valid.value, cuspsLongitudeDegrees: [0, 30, 60] },
      };
    };
    await expect(
      getValidatedHouseCusps(provider, CONFORMANCE_HOUSE_REQUEST),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-provider-response" },
    });
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
    dataVersion: "fixture-data-2026-01",
    calculatedAt: CONFORMANCE_INSTANT,
    timeScale: "utc",
    referenceFrame: "ecliptic-of-date",
    zodiacReference: request.zodiacReference,
    coordinateOrigin,
  };
}

expect(CELESTIAL_BODIES).toHaveLength(10);
