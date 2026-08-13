import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PUBLIC_LUNAR_CALENDAR_DAYS,
  PublicLunarCalendarEngine,
} from "@/application/calculate-public-lunar-calendar";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { PublicLunarCalendarLoader } from "@/server/public-lunar-calendar-loader";
import {
  publicLunarDateWindow,
  publicLunarRouteDates,
} from "@/presentation/public-lunar-date";

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
    const value = { date: "2026-08-13" };
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
    resolve({ ok: true, value });
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
});
