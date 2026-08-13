import { describe, expect, it } from "vitest";

import {
  CIVIL_TIME_RESOLVER_VERSION,
  resolveCivilTime,
} from "@/domain/time/civil-time";

describe("resolveCivilTime", () => {
  it("resolves a unique Toronto civil minute with its exact offset", () => {
    expect(
      resolveCivilTime({
        date: "2024-01-15",
        time: "12:30",
        timezone: "America/Toronto",
      }),
    ).toEqual({
      status: "unique",
      instant: "2024-01-15T17:30:00.000Z",
      offsetSeconds: -18_000,
      resolverVersion: CIVIL_TIME_RESOLVER_VERSION,
    });
  });

  it("returns both ordered instants for a fall DST fold", () => {
    expect(
      resolveCivilTime({
        date: "2024-11-03",
        time: "01:30",
        timezone: "America/Toronto",
      }),
    ).toEqual({
      status: "ambiguous",
      candidates: [
        { instant: "2024-11-03T05:30:00.000Z", offsetSeconds: -14_400 },
        { instant: "2024-11-03T06:30:00.000Z", offsetSeconds: -18_000 },
      ],
      resolverVersion: CIVIL_TIME_RESOLVER_VERSION,
    });
  });

  it("returns nonexistent for a spring DST gap", () => {
    expect(
      resolveCivilTime({
        date: "2024-03-10",
        time: "02:30",
        timezone: "America/Toronto",
      }),
    ).toEqual({
      status: "nonexistent",
      resolverVersion: CIVIL_TIME_RESOLVER_VERSION,
    });
  });

  it("supports non-hour and historical second offsets", () => {
    expect(
      resolveCivilTime({
        date: "2024-06-01",
        time: "12:00",
        timezone: "Asia/Kathmandu",
      }),
    ).toMatchObject({
      status: "unique",
      instant: "2024-06-01T06:15:00.000Z",
      offsetSeconds: 20_700,
    });
    expect(
      resolveCivilTime({
        date: "1900-01-01",
        time: "12:00",
        timezone: "Europe/Amsterdam",
      }).status,
    ).toBe("unique");
  });

  it.each([
    { date: "2024-02-30", time: "12:00", timezone: "UTC" },
    { date: "2024-01-01", time: "24:00", timezone: "UTC" },
    { date: "2024-01-01", time: "12:00", timezone: "Not/AZone" },
  ])("rejects invalid civil input %#", (input) => {
    expect(() => resolveCivilTime(input)).toThrow(RangeError);
  });
});
