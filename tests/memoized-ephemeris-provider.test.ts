import { describe, expect, it } from "vitest";

import {
  CELESTIAL_BODIES,
  type EphemerisProvider,
  type PositionRequest,
} from "@/domain/astro/contracts";
import { MemoizedEphemerisProvider } from "@/infrastructure/ephemeris/memoized-ephemeris-provider";

describe("MemoizedEphemerisProvider", () => {
  it("projects repeated body subsets from one request-local observation", async () => {
    let calls = 0;
    const source: EphemerisProvider = {
      id: "memo-fixture",
      async getPositions(request: PositionRequest) {
        calls += 1;
        return {
          ok: true as const,
          value: {
            instant: request.instant,
            positions: request.bodies.map((body, index) => ({
              body,
              eclipticLongitudeDegrees: index * 10,
              speedLongitudeDegreesPerDay: 1,
            })),
            metadata: {
              providerId: "memo-fixture",
              providerVersion: "1.0.0",
              dataVersion: "fixture-1",
              calculatedAt: request.instant,
              timeScale: "utc" as const,
              referenceFrame: "ecliptic-of-date" as const,
              zodiacReference: request.zodiacReference,
              coordinateOrigin: request.coordinateOrigin,
            },
          },
        };
      },
      async getHouseCusps() {
        throw new Error("not used");
      },
    };
    const provider = new MemoizedEphemerisProvider(source);
    const request = {
      instant: "2000-01-01T00:00:00.000Z",
      bodies: CELESTIAL_BODIES,
      zodiacReference: "tropical" as const,
      coordinateOrigin: "geocentric" as const,
    };
    const all = await provider.getPositions(request);
    const subset = await provider.getPositions({
      ...request,
      bodies: ["sun", "moon"],
    });

    expect(all.ok).toBe(true);
    expect(subset.ok && subset.value.positions.map(({ body }) => body)).toEqual(
      ["sun", "moon"],
    );
    expect(calls).toBe(1);
    expect(provider.providerPositionCallCount).toBe(1);
  });
});
