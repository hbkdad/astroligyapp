import { describe, expect, it, vi } from "vitest";

import {
  CELESTIAL_BODIES,
  type EphemerisProvider,
  type EphemerisProviderErrorCode,
  type HouseRequest,
  type PositionRequest,
} from "@/domain/astro/contracts";
import {
  getValidatedHouseCusps,
  getValidatedPositions,
} from "@/domain/astro/provider-validation";

export const CONFORMANCE_INSTANT = "2026-01-01T00:00:00.000Z";

export const CONFORMANCE_POSITION_REQUEST: PositionRequest = {
  instant: CONFORMANCE_INSTANT,
  bodies: CELESTIAL_BODIES,
  zodiacReference: "tropical",
  coordinateOrigin: "geocentric",
};

export const CONFORMANCE_HOUSE_REQUEST: HouseRequest = {
  instant: CONFORMANCE_INSTANT,
  observer: {
    latitudeDegrees: 45.4215,
    longitudeDegrees: -75.6972,
    elevationMeters: 70,
  },
  houseSystem: "whole-sign",
  zodiacReference: "tropical",
};

export function describeEphemerisProviderConformance(
  name: string,
  createProvider: () => EphemerisProvider,
  options: { houses?: "required" | "unsupported" } = {},
): void {
  describe(`${name} EphemerisProvider conformance`, () => {
    it("returns every requested body exactly once with normalized metadata", async () => {
      const result = await getValidatedPositions(
        createProvider(),
        CONFORMANCE_POSITION_REQUEST,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.positions.map((position) => position.body)).toEqual(
        CELESTIAL_BODIES,
      );
      expect(result.value.metadata).toMatchObject({
        timeScale: "utc",
        referenceFrame: "ecliptic-of-date",
        zodiacReference: "tropical",
        coordinateOrigin: "geocentric",
      });
    });

    it(`${options.houses === "unsupported" ? "explicitly rejects" : "returns"} house cusps`, async () => {
      const result = await getValidatedHouseCusps(
        createProvider(),
        CONFORMANCE_HOUSE_REQUEST,
      );
      if (options.houses === "unsupported") {
        expect(result).toMatchObject({
          ok: false,
          error: { code: "unsupported-capability", retryable: false },
        });
        return;
      }
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.cuspsLongitudeDegrees).toHaveLength(12);
      expect(result.value.metadata.coordinateOrigin).toBe("topocentric");
    });

    it("rejects invalid requests before invoking the provider", async () => {
      const provider = createProvider();
      const dispatch = vi.spyOn(provider, "getPositions");
      await expect(
        getValidatedPositions(provider, {
          ...CONFORMANCE_POSITION_REQUEST,
          bodies: ["sun", "sun"],
        }),
      ).rejects.toThrow("duplicate body");
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("rejects incomplete output instead of silently falling back", async () => {
      const provider = createProvider();
      const original = provider.getPositions.bind(provider);
      provider.getPositions = async (request) => {
        const response = await original(request);
        if (!response.ok) return response;
        return {
          ok: true,
          value: {
            ...response.value,
            positions: response.value.positions.slice(1),
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

    it("normalizes thrown failures without a fallback result", async () => {
      const provider = createProvider();
      provider.getPositions = async () => {
        throw new Error("provider diagnostic that must not escape");
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

    it.each([
      ["invalid-request", false],
      ["unsupported-capability", false],
      ["data-unavailable", true],
      ["provider-unavailable", true],
      ["invalid-provider-response", false],
    ] satisfies readonly (readonly [EphemerisProviderErrorCode, boolean])[])(
      "preserves the documented %s error",
      async (code, retryable) => {
        const provider = createProvider();
        provider.getPositions = async () => ({
          ok: false,
          error: { code, message: `Conformance ${code}`, retryable },
        });
        await expect(
          getValidatedPositions(provider, CONFORMANCE_POSITION_REQUEST),
        ).resolves.toEqual({
          ok: false,
          error: { code, message: `Conformance ${code}`, retryable },
        });
      },
    );
  });
}
