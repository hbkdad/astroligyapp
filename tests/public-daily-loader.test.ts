import { describe, expect, it } from "vitest";

import {
  MemoryPublicDailyCache,
  PUBLIC_DAILY_CACHE_ENTRY_VERSION,
  PUBLIC_DAILY_LOADER_VERSION,
  PublicDailyReadingLoader,
  type PublicClock,
  type PublicDailyCache,
  type PublicProviderExpectation,
} from "@/application/load-public-daily-readings";
import { DEFAULT_ASPECT_DEFINITIONS } from "@/domain/astro/aspects";
import {
  type EphemerisProvider,
  type PositionRequest,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { ZODIAC_SIGNS } from "@/domain/astro/zodiac";
import { DeterministicInterpretationLibrary } from "@/domain/interpretation/library";
import { PUBLIC_INTERPRETATION_LIBRARY } from "@/domain/interpretation/public-library";
import { AggregateCalculationPerformanceSink } from "@/application/calculation-performance";

const EXPECTATION: PublicProviderExpectation = {
  id: "public-loader-fixture",
  providerVersion: "fixture-1.0.0",
  dataVersion: "fixture-data-1.0.0",
};

class MutableClock implements PublicClock {
  constructor(public instant: string) {}
  now(): Date {
    return new Date(this.instant);
  }
}

class LoaderFixtureProvider implements EphemerisProvider {
  readonly id = EXPECTATION.id;
  calls = 0;
  lastRequest?: PositionRequest;

  constructor(
    readonly providerVersion = EXPECTATION.providerVersion,
    readonly dataVersion = EXPECTATION.dataVersion,
    private readonly mode: "success" | "failure" = "success",
    private readonly delayMilliseconds = 0,
  ) {}

  async getPositions(request: PositionRequest) {
    this.calls += 1;
    this.lastRequest = structuredClone(request);
    if (this.delayMilliseconds)
      await new Promise((resolve) =>
        setTimeout(resolve, this.delayMilliseconds),
      );
    if (this.mode === "failure")
      return {
        ok: false as const,
        error: {
          code: "provider-unavailable" as const,
          message: "Private upstream detail must not escape",
          retryable: true,
        },
      };
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        positions: request.bodies.map((body, index) => ({
          body,
          eclipticLongitudeDegrees: index * 36 + 15,
          speedLongitudeDegreesPerDay: index + 0.25,
        })),
        metadata: metadata(this, request),
      },
    };
  }

  async getHouseCusps() {
    return {
      ok: false as const,
      error: {
        code: "unsupported-capability" as const,
        message: "Fixture does not calculate houses",
        retryable: false,
      },
    };
  }
}

describe("public daily reading loader", () => {
  it("derives the trusted UTC date, misses once, then serves a validated cache hit", async () => {
    const provider = new LoaderFixtureProvider();
    const cache = new MemoryPublicDailyCache();
    const clock = new MutableClock("2026-08-10T04:30:00Z");
    const loader = new PublicDailyReadingLoader(
      provider,
      EXPECTATION,
      cache,
      clock,
    );

    const first = await loader.loadCurrent();
    const second = await loader.loadCurrent();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toMatchObject({
      date: "2026-08-10",
      metadata: {
        loaderVersion: PUBLIC_DAILY_LOADER_VERSION,
        cacheEntryVersion: PUBLIC_DAILY_CACHE_ENTRY_VERSION,
        cacheStatus: "miss",
        loadedAt: "2026-08-10T04:30:00.000Z",
        expiresAt: "2026-08-10T04:45:00.000Z",
      },
    });
    expect(second.value.metadata.cacheStatus).toBe("hit");
    expect(provider.calls).toBe(1);
    expect(cache.size).toBe(1);
    expect(first.value.models.map((model) => model.sign)).toEqual(ZODIAC_SIGNS);
    expect(first.value.aggregate.date).toBe(first.value.date);
    expect(provider.lastRequest).toEqual({
      instant: "2026-08-10T12:00:00Z",
      bodies: expect.any(Array),
      zodiacReference: "tropical",
      coordinateOrigin: "geocentric",
    });
    expect(provider.lastRequest).not.toHaveProperty("observer");
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(Object.isFrozen(first.value.models)).toBe(true);
  });

  it("records aggregate miss/hit timing without cache keys or request data", async () => {
    const sink = new AggregateCalculationPerformanceSink();
    let tick = 0;
    const loader = new PublicDailyReadingLoader(
      new LoaderFixtureProvider(),
      EXPECTATION,
      new MemoryPublicDailyCache(),
      new MutableClock("2026-08-10T04:30:00Z"),
      undefined,
      undefined,
      900_000,
      sink,
      () => (tick += 5),
    );
    await loader.loadCurrent();
    await loader.loadCurrent();
    expect(sink.snapshot()).toEqual([
      expect.objectContaining({
        flow: "public-daily",
        outcome: "hit",
        count: 1,
        totalDurationMilliseconds: 5,
      }),
      expect.objectContaining({
        flow: "public-daily",
        outcome: "miss",
        count: 1,
        totalDurationMilliseconds: 5,
      }),
    ]);
    expect(JSON.stringify(sink.snapshot())).not.toContain("2026-08-10");
  });

  it("coalesces concurrent cache misses into one provider calculation", async () => {
    const provider = new LoaderFixtureProvider(
      EXPECTATION.providerVersion,
      EXPECTATION.dataVersion,
      "success",
      20,
    );
    const loader = new PublicDailyReadingLoader(
      provider,
      EXPECTATION,
      new MemoryPublicDailyCache(),
      new MutableClock("2026-08-10T05:00:00Z"),
    );
    const [first, second, third] = await Promise.all([
      loader.loadCurrent(),
      loader.loadCurrent(),
      loader.loadCurrent(),
    ]);
    expect(provider.calls).toBe(1);
    expect([first, second, third].map(cacheStatus)).toEqual([
      "miss",
      "coalesced",
      "coalesced",
    ]);
  });

  it("expires within a date and isolates the next UTC date at rollover", async () => {
    const provider = new LoaderFixtureProvider();
    const cache = new MemoryPublicDailyCache();
    const clock = new MutableClock("2026-08-10T23:58:00Z");
    const loader = new PublicDailyReadingLoader(
      provider,
      EXPECTATION,
      cache,
      clock,
      PUBLIC_INTERPRETATION_LIBRARY,
      DEFAULT_ASPECT_DEFINITIONS,
      60_000,
    );
    const first = await loader.loadCurrent();
    clock.instant = "2026-08-10T23:59:30Z";
    const expired = await loader.loadCurrent();
    clock.instant = "2026-08-11T00:00:10Z";
    const rollover = await loader.loadCurrent();
    expect(cacheStatus(first)).toBe("miss");
    expect(cacheStatus(expired)).toBe("expired-regenerated");
    expect(cacheStatus(rollover)).toBe("miss");
    expect(rollover.ok && rollover.value.date).toBe("2026-08-11");
    expect(provider.calls).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("includes every provider/calculation/content configuration in an opaque-safe key", () => {
    const loader = new PublicDailyReadingLoader(
      new LoaderFixtureProvider(),
      EXPECTATION,
      new MemoryPublicDailyCache(),
      new MutableClock("2026-08-10T00:00:00Z"),
    );
    const key = loader.cacheKeyForDate("2026-08-10");
    expect(key).toContain("loader=1.0.0");
    expect(key).toContain("entry=1.0.0");
    expect(key).toContain("ttlMs=900000");
    expect(key).toContain("provider=public-loader-fixture");
    expect(key).toContain("providerVersion=fixture-1.0.0");
    expect(key).toContain("dataVersion=fixture-data-1.0.0");
    expect(key).toContain("aggregate=1.0.0");
    expect(key).toContain("readModel=1.0.0");
    expect(key).toContain("projection=1.0.0");
    expect(key).toContain("lunar=1.0.0");
    expect(key).toContain("sample=utc-noon");
    expect(key).toContain("target=tropical-sign-midpoint");
    expect(key).toContain("aspectPolicy=major-aspects:1.0.0");
    expect(key).toContain("library=public-reflection-en-ca:1.0.0:en-CA");
    expect(key).not.toMatch(/birth|account|profile|observer|name|location/i);
    expect(() => loader.cacheKeyForDate("2026-02-30")).toThrow(
      "Invalid public cache date",
    );
  });

  it("isolates cache entries when the content-library version changes", async () => {
    const cache = new MemoryPublicDailyCache();
    const clock = new MutableClock("2026-08-10T00:00:00Z");
    const firstProvider = new LoaderFixtureProvider();
    const secondProvider = new LoaderFixtureProvider();
    const first = new PublicDailyReadingLoader(
      firstProvider,
      EXPECTATION,
      cache,
      clock,
      emptyLibrary("1.0.0"),
    );
    const second = new PublicDailyReadingLoader(
      secondProvider,
      EXPECTATION,
      cache,
      clock,
      emptyLibrary("2.0.0"),
    );
    expect(first.cacheKeyForDate("2026-08-10")).not.toBe(
      second.cacheKeyForDate("2026-08-10"),
    );
    expect(cacheStatus(await first.loadCurrent())).toBe("miss");
    expect(cacheStatus(await second.loadCurrent())).toBe("miss");
    expect(cache.size).toBe(2);
  });

  it("deletes malformed cached data and regenerates without leaking injected fields", async () => {
    const provider = new LoaderFixtureProvider();
    const cache = new MemoryPublicDailyCache();
    const clock = new MutableClock("2026-08-10T01:00:00Z");
    const loader = new PublicDailyReadingLoader(
      provider,
      EXPECTATION,
      cache,
      clock,
    );
    const key = loader.cacheKeyForDate("2026-08-10");
    await cache.set(key, {
      version: PUBLIC_DAILY_CACHE_ENTRY_VERSION,
      key,
      date: "2026-08-10",
      createdAt: "2026-08-10T00:59:00Z",
      expiresAt: "2026-08-10T01:10:00Z",
      aggregate: {},
      birthDate: "private-marker",
    });
    const result = await loader.loadCurrent();
    expect(cacheStatus(result)).toBe("invalid-regenerated");
    expect(provider.calls).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(
      /private-marker|birthDate|accountId|profileId|observer|fullName/,
    );
  });

  it("returns generic errors for source, provider-version, cache-read, and cache-delete failures", async () => {
    const clock = new MutableClock("2026-08-10T01:00:00Z");
    const upstream = await new PublicDailyReadingLoader(
      new LoaderFixtureProvider(
        EXPECTATION.providerVersion,
        EXPECTATION.dataVersion,
        "failure",
      ),
      EXPECTATION,
      new MemoryPublicDailyCache(),
      clock,
    ).loadCurrent();
    expect(upstream).toEqual(genericFailure("source-unavailable", true));
    expect(JSON.stringify(upstream)).not.toContain("Private upstream detail");

    const mismatch = await new PublicDailyReadingLoader(
      new LoaderFixtureProvider("wrong-version"),
      EXPECTATION,
      new MemoryPublicDailyCache(),
      clock,
    ).loadCurrent();
    expect(mismatch).toEqual(genericFailure("source-unavailable", false));

    const readFailure = await new PublicDailyReadingLoader(
      new LoaderFixtureProvider(),
      EXPECTATION,
      failingCache("get"),
      clock,
    ).loadCurrent();
    expect(readFailure).toEqual(genericFailure("cache-unavailable", true));

    const deleteCache = failingCache("delete", { corrupt: true });
    const deleteFailure = await new PublicDailyReadingLoader(
      new LoaderFixtureProvider(),
      EXPECTATION,
      deleteCache,
      clock,
    ).loadCurrent();
    expect(deleteFailure).toEqual(genericFailure("cache-unavailable", true));
  });

  it("serves a fresh result with explicit write-skipped status when cache storage fails", async () => {
    const result = await new PublicDailyReadingLoader(
      new LoaderFixtureProvider(),
      EXPECTATION,
      failingCache("set"),
      new MutableClock("2026-08-10T02:00:00Z"),
    ).loadCurrent();
    expect(cacheStatus(result)).toBe("write-skipped");
  });

  it("rejects invalid clock/configuration and bounds the in-memory cache", async () => {
    const invalidClock = await new PublicDailyReadingLoader(
      new LoaderFixtureProvider(),
      EXPECTATION,
      new MemoryPublicDailyCache(),
      { now: () => new Date(Number.NaN) },
    ).loadCurrent();
    expect(invalidClock).toEqual(genericFailure("invalid-clock", false));
    expect(
      () =>
        new PublicDailyReadingLoader(
          new LoaderFixtureProvider(),
          { ...EXPECTATION, id: "wrong" },
          new MemoryPublicDailyCache(),
          new MutableClock("2026-08-10T00:00:00Z"),
        ),
    ).toThrow("provider expectation");
    expect(() => new MemoryPublicDailyCache(0)).toThrow("between 1 and 64");
    expect(() => new MemoryPublicDailyCache(65)).toThrow("between 1 and 64");

    const bounded = new MemoryPublicDailyCache(2);
    await bounded.set("one", 1);
    await bounded.set("two", 2);
    await bounded.set("three", 3);
    expect(bounded.size).toBe(2);
    expect(await bounded.get("one")).toBeNull();
    expect(await bounded.get("three")).toBe(3);
  });
});

function metadata(
  provider: LoaderFixtureProvider,
  request: PositionRequest,
): ProviderMetadata {
  return {
    providerId: provider.id,
    providerVersion: provider.providerVersion,
    dataVersion: provider.dataVersion,
    calculatedAt: request.instant,
    timeScale: "utc",
    referenceFrame: "ecliptic-of-date",
    zodiacReference: request.zodiacReference,
    coordinateOrigin: request.coordinateOrigin,
  };
}

function emptyLibrary(version: string) {
  return new DeterministicInterpretationLibrary({
    id: "empty-public-loader-fixture",
    version,
    locale: "en-CA",
    templates: [],
  });
}

function cacheStatus(
  result: Awaited<ReturnType<PublicDailyReadingLoader["loadCurrent"]>>,
) {
  return result.ok ? result.value.metadata.cacheStatus : result.error.code;
}

function genericFailure(
  code: "source-unavailable" | "cache-unavailable" | "invalid-clock",
  retryable: boolean,
) {
  return {
    ok: false,
    error: {
      code,
      message: "Public daily reading is temporarily unavailable",
      retryable,
    },
  };
}

function failingCache(
  operation: "get" | "set" | "delete",
  initial: unknown | null = null,
): PublicDailyCache {
  let value = initial;
  return {
    async get() {
      if (operation === "get") throw new Error("private cache read detail");
      return value;
    },
    async set(_key, next) {
      if (operation === "set") throw new Error("private cache write detail");
      value = next;
    },
    async delete() {
      if (operation === "delete")
        throw new Error("private cache delete detail");
      value = null;
    },
  };
}
