import { describe, expect, it, vi } from "vitest";

import type { PublicDailyLoadResult } from "@/application/load-public-daily-readings";
import type { EphemerisProvider } from "@/domain/astro/contracts";
import { ZODIAC_SIGNS } from "@/domain/astro/zodiac";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { loadPublicHoroscopeViewState } from "@/presentation/public-horoscope-route";

vi.mock("server-only", () => ({}));

import {
  createPublicDailyReadingLoader,
  PUBLIC_CURRENT_CACHE_MAXIMUM_ENTRIES,
  PUBLIC_CURRENT_CACHE_TTL_MILLISECONDS,
  PUBLIC_CURRENT_PROVIDER_EXPECTATION,
  SystemUtcClock,
} from "@/server/public-daily-reading-loader";

describe("current public horoscope route boundary", () => {
  it("builds all twelve current-date states through one concurrent calculation", async () => {
    const base = new AstronomyEngineProvider();
    let calls = 0;
    const provider: EphemerisProvider = {
      id: base.id,
      async getPositions(request) {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return base.getPositions(request);
      },
      getHouseCusps: (request) => base.getHouseCusps(request),
    };
    const loader = createPublicDailyReadingLoader({
      provider,
      clock: { now: () => new Date("2026-08-10T23:59:59Z") },
    });
    const states = await Promise.all(
      ZODIAC_SIGNS.map((sign) =>
        loadPublicHoroscopeViewState(sign, () => loader.loadCurrent()),
      ),
    );

    expect(calls).toBe(1);
    expect(states).toHaveLength(12);
    expect(
      states.map((state) =>
        state.status === "ready"
          ? [state.model.sign, state.model.date, state.model.effectiveAt]
          : state.status,
      ),
    ).toEqual(
      ZODIAC_SIGNS.map((sign) => [sign, "2026-08-10", "2026-08-10T12:00:00Z"]),
    );
  });

  it("declares exact local provider versions and bounded process defaults", () => {
    expect(PUBLIC_CURRENT_PROVIDER_EXPECTATION).toEqual({
      id: "astronomy-engine",
      providerVersion: "2.1.19",
      dataVersion: "astronomy-engine-model-2.1.19",
    });
    expect(PUBLIC_CURRENT_CACHE_MAXIMUM_ENTRIES).toBe(2);
    expect(PUBLIC_CURRENT_CACHE_TTL_MILLISECONDS).toBe(900_000);
    expect(new SystemUtcClock().now().getTime()).toBeGreaterThan(0);
  });

  it("maps generic source failures to unavailable and local boundary failures to error", async () => {
    const sourceFailure = failure("source-unavailable");
    const cacheFailure = failure("cache-unavailable");
    const unavailable = await loadPublicHoroscopeViewState(
      "aries",
      async () => sourceFailure,
    );
    const error = await loadPublicHoroscopeViewState(
      "aries",
      async () => cacheFailure,
    );

    expect(unavailable).toEqual({
      status: "unavailable",
      message: "Public daily reading is temporarily unavailable",
    });
    expect(error).toEqual({
      status: "error",
      message: "Public daily reading is temporarily unavailable",
    });
    expect(JSON.stringify([unavailable, error])).not.toMatch(
      /provider|cache|clock|private|upstream/i,
    );
  });

  it("fails generically if a successful loader result loses sign coverage", async () => {
    const loader = createPublicDailyReadingLoader({
      clock: { now: () => new Date("2026-08-10T12:00:00Z") },
    });
    const result = await loader.loadCurrent();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const corrupted = structuredClone(result);
    (corrupted.value as unknown as { models: unknown[] }).models =
      corrupted.value.models.slice(0, 1);
    expect(
      await loadPublicHoroscopeViewState(
        "taurus",
        async () => corrupted as PublicDailyLoadResult,
      ),
    ).toEqual({
      status: "error",
      message: "Public daily reading is temporarily unavailable",
    });
  });
});

function failure(
  code: "source-unavailable" | "cache-unavailable",
): PublicDailyLoadResult {
  return {
    ok: false,
    error: {
      code,
      message: "Public daily reading is temporarily unavailable",
      retryable: true,
    },
  };
}
