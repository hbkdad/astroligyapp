import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PUBLIC_LUNAR_CALENDAR_DAYS,
  PublicLunarCalendarEngine,
  type PublicLunarCalendar,
} from "@/application/calculate-public-lunar-calendar";
import { AggregateCalculationPerformanceSink } from "@/application/calculation-performance";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import {
  MemoryPublicLunarCache,
  PUBLIC_LUNAR_CACHE_TTL_MILLISECONDS,
  PublicLunarCalendarLoader,
  type PublicLunarCache,
} from "@/server/public-lunar-calendar-loader";
import {
  publicLunarDateWindow,
  publicLunarRouteDates,
} from "@/presentation/public-lunar-date";

let currentCalendar: PublicLunarCalendar;

beforeAll(async () => {
  const result = await new PublicLunarCalendarEngine(
    new AstronomyEngineProvider(),
    () => new Date("2026-08-13T15:00:00.000Z"),
  ).calculate("2026-08-13");
  if (!result.ok) throw new Error(result.error.message);
  currentCalendar = result.value;
});

describe("public lunar calendar", () => {
  it("composes a geocentric UTC-noon phase and only refined seven-day events", async () => {
    const result = await new PublicLunarCalendarEngine(
      new AstronomyEngineProvider(),
      () => new Date("2026-08-13T15:00:00.000Z"),
    ).calculate("2000-01-01");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      date: "2000-01-01",
      timezone: "UTC",
      effectiveAt: "2000-01-01T12:00:00.000Z",
      metadata: {
        lunarPhaseEngineVersion: "1.0.0",
        lunarEventSearchVersion: "1.0.0",
        provider: {
          coordinateOrigin: "geocentric",
          zodiacReference: "tropical",
        },
      },
    });
    expect(result.value.events.length).toBeGreaterThan(1);
    expect(result.value.metadata.providerPositionCallCount).toBe(59);
    expect(
      result.value.events.every(({ event }) => {
        const epoch = Date.parse(event.point.instant);
        return (
          epoch >= Date.parse("2000-01-01T00:00:00.000Z") &&
          epoch < Date.parse("2000-01-08T00:00:00.000Z")
        );
      }),
    ).toBe(true);
    expect(Object.isFrozen(result.value.events)).toBe(true);
    expect(PUBLIC_LUNAR_CALENDAR_DAYS).toBe(7);
  }, 20_000);

  it("returns an explicit invalid-request failure for malformed calendar dates", async () => {
    const provider = {
      id: "unused",
      getPositions: vi.fn(),
      getHouseCusps: vi.fn(),
    };
    await expect(
      new PublicLunarCalendarEngine(provider).calculate("2026-02-29"),
    ).resolves.toMatchObject({ ok: false, error: { code: "invalid-request" } });
    expect(provider.getPositions).not.toHaveBeenCalled();
  });

  it("bounds canonical date routing across leap and month boundaries", () => {
    const now = new Date("2028-02-28T23:59:59.000Z");
    expect(publicLunarRouteDates(now)).toHaveLength(31);
    expect(publicLunarRouteDates(now).slice(0, 3)).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
    expect(publicLunarDateWindow("2028-02-29", now)).toMatchObject({
      previousDate: "2028-02-28",
      nextDate: "2028-03-01",
    });
    expect(publicLunarDateWindow("2028-02-27", now)).toBeNull();
    expect(publicLunarDateWindow("2028-02-30", now)).toBeNull();
    expect(publicLunarDateWindow("2028-03-30", now)).toBeNull();
  });

  it("coalesces and caches one complete date identity", async () => {
    let resolve!: (result: unknown) => void;
    const calculate = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loader = new PublicLunarCalendarLoader(
      { calculate } as never,
      () => new Date("2026-08-13T12:00:00.000Z"),
    );
    const first = loader.load("2026-08-13");
    const second = loader.load("2026-08-13");
    await vi.waitFor(() => expect(calculate).toHaveBeenCalledOnce());
    resolve({ ok: true, value: currentCalendar });
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { ok: true, cacheStatus: "miss" },
      { ok: true, cacheStatus: "coalesced" },
    ]);
    await expect(loader.load("2026-08-13")).resolves.toMatchObject({
      ok: true,
      cacheStatus: "hit",
    });
    expect(calculate).toHaveBeenCalledOnce();
    expect(loader.cacheKey("2026-08-13")).toContain("providerVersion=");
  });

  it("expires, rejects corrupt entries, and bounds cache storage", async () => {
    let now = new Date("2026-08-13T12:00:00.000Z");
    const calculate = vi.fn(async () => ({
      ok: true as const,
      value: currentCalendar,
    }));
    const cache = new MemoryPublicLunarCache(2);
    const loader = new PublicLunarCalendarLoader(
      { calculate },
      () => now,
      cache,
    );
    await expect(loader.load("2026-08-13")).resolves.toMatchObject({
      ok: true,
      cacheStatus: "miss",
    });
    const key = loader.cacheKey("2026-08-13");
    await cache.set(key, { privateMarker: "must-not-escape" });
    const regenerated = await loader.load("2026-08-13");
    expect(regenerated).toMatchObject({
      ok: true,
      cacheStatus: "invalid-regenerated",
    });
    expect(JSON.stringify(regenerated)).not.toContain("must-not-escape");
    now = new Date(
      Date.parse("2026-08-13T12:00:00.000Z") +
        PUBLIC_LUNAR_CACHE_TTL_MILLISECONDS +
        1,
    );
    await expect(loader.load("2026-08-13")).resolves.toMatchObject({
      ok: true,
      cacheStatus: "expired-regenerated",
    });
    expect(calculate).toHaveBeenCalledTimes(3);
    await cache.set("one", {});
    await cache.set("two", {});
    await cache.set("three", {});
    expect(cache.size).toBe(2);
    expect(await cache.get("one")).toBeNull();
  });

  it("maps cache failures generically and does not let write failures hide fresh data", async () => {
    const calculate = vi.fn(async () => ({
      ok: true as const,
      value: currentCalendar,
    }));
    const failing = (
      operation: "get" | "set" | "delete",
    ): PublicLunarCache => ({
      async get() {
        if (operation === "get") throw new Error("private read detail");
        return operation === "delete" ? { corrupt: true } : null;
      },
      async set() {
        if (operation === "set") throw new Error("private write detail");
      },
      async delete() {
        if (operation === "delete") throw new Error("private delete detail");
      },
    });
    const clock = () => new Date("2026-08-13T12:00:00.000Z");
    await expect(
      new PublicLunarCalendarLoader({ calculate }, clock, failing("get")).load(
        "2026-08-13",
      ),
    ).resolves.toEqual({ ok: false, reason: "cache-unavailable" });
    await expect(
      new PublicLunarCalendarLoader(
        { calculate },
        clock,
        failing("delete"),
      ).load("2026-08-13"),
    ).resolves.toEqual({ ok: false, reason: "cache-unavailable" });
    await expect(
      new PublicLunarCalendarLoader({ calculate }, clock, failing("set")).load(
        "2026-08-13",
      ),
    ).resolves.toMatchObject({ ok: true, cacheStatus: "write-skipped" });
  });

  it("fails closed for invalid clocks, cache configuration, and cache dates", async () => {
    const calculate = vi.fn();
    const loader = new PublicLunarCalendarLoader(
      { calculate },
      () => new Date(Number.NaN),
    );
    await expect(loader.load("2026-08-13")).resolves.toEqual({
      ok: false,
      reason: "invalid-clock",
    });
    expect(calculate).not.toHaveBeenCalled();
    expect(() => loader.cacheKey("2026-02-29")).toThrow(
      "Invalid public lunar cache date",
    );
    expect(() => new MemoryPublicLunarCache(0)).toThrow("between 1 and 40");
    expect(
      () =>
        new PublicLunarCalendarLoader(
          { calculate },
          () => new Date(),
          new MemoryPublicLunarCache(),
          1,
        ),
    ).toThrow("between one minute and one day");
  });

  it("measures misses and hits without recording the requested date", async () => {
    const sink = new AggregateCalculationPerformanceSink();
    let tick = 0;
    const loader = new PublicLunarCalendarLoader(
      {
        calculate: vi.fn(async () => ({
          ok: true as const,
          value: currentCalendar,
        })),
      },
      () => new Date("2026-08-13T12:00:00.000Z"),
      new MemoryPublicLunarCache(),
      PUBLIC_LUNAR_CACHE_TTL_MILLISECONDS,
      sink,
      () => (tick += 5),
    );
    await loader.load("2026-08-13");
    await loader.load("2026-08-13");
    expect(sink.snapshot()).toEqual([
      expect.objectContaining({
        flow: "public-lunar",
        outcome: "hit",
        count: 1,
        providerPositionCallCount: 0,
      }),
      expect.objectContaining({
        flow: "public-lunar",
        outcome: "miss",
        count: 1,
        providerPositionCallCount:
          currentCalendar.metadata.providerPositionCallCount,
      }),
    ]);
    expect(JSON.stringify(sink.snapshot())).not.toContain("2026-08-13");
  });
});
