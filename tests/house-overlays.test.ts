import { describe, expect, it } from "vitest";

import {
  calculateNatalAspects,
  type NatalChart,
} from "@/application/calculate-natal-chart";
import {
  HouseOverlayEngine,
  InvalidHouseOverlayInputError,
} from "@/application/calculate-house-overlays";
import { CELESTIAL_BODIES } from "@/domain/astro/contracts";
import { findHouseNumber } from "@/domain/astro/house-strategies";
import { toZodiacPosition } from "@/domain/astro/zodiac";
import { ZOLLIKON_NATAL_CHART_DEMO } from "@/presentation/natal-chart-demo";

const BASE_LONGITUDES = [0, 18, 37, 59, 83, 111, 147, 191, 239, 301];

describe("deterministic cross-chart house overlays", () => {
  it("publishes exactly twenty stable bidirectional overlays in canonical order", () => {
    const result = new HouseOverlayEngine().calculate(
      chart("fixture-a", BASE_LONGITUDES),
      chart(
        "fixture-b",
        BASE_LONGITUDES.map((longitude) => (longitude + 11) % 360),
      ),
    );

    expect(result.overlays).toHaveLength(20);
    expect(new Set(result.overlays.map((overlay) => overlay.id)).size).toBe(20);
    expect(
      result.overlays.map((overlay) => [
        overlay.source.chart,
        overlay.source.body,
        overlay.target.chart,
      ]),
    ).toEqual([
      ...CELESTIAL_BODIES.map((body) => ["chart-a", body, "chart-b"]),
      ...CELESTIAL_BODIES.map((body) => ["chart-b", body, "chart-a"]),
    ]);
    expect(result.overlays[0]).toMatchObject({
      id: "house-overlay:chart-a:sun:in:chart-b:house:4",
      source: {
        chart: "chart-a",
        body: "sun",
        eclipticLongitudeDegrees: 0,
      },
      target: {
        chart: "chart-b",
        houseNumber: 4,
        cuspLongitudeDegrees: 0,
      },
    });
  });

  it("maps every exact cusp to its house and just-below to the prior house", () => {
    const target = chart("fixture-b", BASE_LONGITUDES);
    const cusps = target.houses.cuspsLongitudeDegrees;
    for (let index = 0; index < cusps.length; index += 1) {
      const cusp = cusps[index]!;
      const exact = new HouseOverlayEngine().calculate(
        chart("fixture-a", replaceSun(BASE_LONGITUDES, cusp)),
        target,
      );
      expect(sunFromChartA(exact).target).toEqual({
        chart: "chart-b",
        houseNumber: index + 1,
        cuspLongitudeDegrees: cusp,
      });

      const belowLongitude = (cusp - 0.000001 + 360) % 360;
      const below = new HouseOverlayEngine().calculate(
        chart("fixture-a", replaceSun(BASE_LONGITUDES, belowLongitude)),
        target,
      );
      const priorIndex = (index + 11) % 12;
      expect(sunFromChartA(below).target).toEqual({
        chart: "chart-b",
        houseNumber: priorIndex + 1,
        cuspLongitudeDegrees: cusps[priorIndex],
      });
    }
  });

  it("is byte-equivalent when input charts reverse", () => {
    const first = chart("fixture-a", BASE_LONGITUDES);
    const second = chart(
      "fixture-b",
      BASE_LONGITUDES.map((longitude) => (longitude + 143) % 360),
    );
    const engine = new HouseOverlayEngine();
    const forward = engine.calculate(first, second);
    const reversed = engine.calculate(second, first);

    expect(reversed).toEqual(forward);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
    expect(
      forward.charts.map((source) => source.positionProvider.providerId),
    ).toEqual(["fixture-a", "fixture-b"]);
  });

  it("retains the complete overlay trace without raw natal inputs", () => {
    const first = chart("fixture-a", BASE_LONGITUDES);
    first.input.instant = "1992-03-04T05:06:07Z";
    first.input.timezone = "America/Toronto";
    first.input.timezoneSource = "private-overlay-timezone-marker";
    first.input.coordinateSource = "private-overlay-coordinate-marker";
    first.input.observer = {
      latitudeDegrees: 48.4758,
      longitudeDegrees: -81.3305,
      elevationMeters: 300,
    };
    const result = new HouseOverlayEngine().calculate(
      first,
      chart("fixture-b", BASE_LONGITUDES),
    );

    expect(result).toMatchObject({
      version: "1.0.0",
      engine: {
        id: "deterministic-cross-chart-house-overlays",
        version: "1.0.0",
      },
      housePolicy: { id: "whole-sign", version: "1.0.0" },
    });
    expect(result.charts[0]).toMatchObject({
      side: "chart-a",
      chartEngineVersion: "1.0.0",
      positionProvider: {
        providerId: "fixture-a",
        providerVersion: "fixture-1.0.0",
        dataVersion: "fixture-data-1.0.0",
      },
      houseProvider: {
        providerId: "astronomy-engine",
        providerVersion: "2.1.19",
        dataVersion: "astronomy-engine-model-2.1.19+whole-sign-1.0.0",
      },
      houseStrategy: { id: "whole-sign", version: "1.0.0" },
      placements: expect.arrayContaining([
        { body: "sun", eclipticLongitudeDegrees: 0 },
      ]),
      cuspsLongitudeDegrees: [
        270, 300, 330, 0, 30, 60, 90, 120, 150, 180, 210, 240,
      ],
    });
    expect(result.disclaimer).toContain("not a compatibility score");
    expect(JSON.stringify(result)).not.toMatch(
      /1992-03-04|America\/Toronto|private-overlay-timezone-marker|private-overlay-coordinate-marker|48\.4758|-81\.3305|observer|timezone|coordinateSource|calculatedAt/,
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.overlays)).toBe(true);
    expect(Object.isFrozen(result.charts[0].cuspsLongitudeDegrees)).toBe(true);
  });

  it.each([
    ["null chart", () => null as unknown as NatalChart],
    [
      "missing placement",
      (value: NatalChart) => {
        (value.placements as NatalChart["placements"][number][]).pop();
        return value;
      },
    ],
    [
      "version drift",
      (value: NatalChart) => {
        value.metadata.chartEngineVersion = "2.0.0";
        return value;
      },
    ],
    [
      "cusp loss",
      (value: NatalChart) => {
        (value.houses.cuspsLongitudeDegrees as number[]).pop();
        return value;
      },
    ],
    [
      "cusp order corruption",
      (value: NatalChart) => {
        (value.houses.cuspsLongitudeDegrees as number[])[1] = 240;
        return value;
      },
    ],
    [
      "placement house corruption",
      (value: NatalChart) => {
        value.placements[0]!.houseNumber = 12;
        return value;
      },
    ],
  ] as const)("fails generically on %s", (_, corrupt) => {
    const candidate = corrupt(chart("fixture-a", BASE_LONGITUDES));
    expect(() =>
      new HouseOverlayEngine().calculate(
        candidate,
        chart("fixture-b", BASE_LONGITUDES),
      ),
    ).toThrow(InvalidHouseOverlayInputError);
    expect(() =>
      new HouseOverlayEngine().calculate(
        candidate,
        chart("fixture-b", BASE_LONGITUDES),
      ),
    ).toThrow("House overlay input is invalid or unsupported");
  });
});

function sunFromChartA(result: ReturnType<HouseOverlayEngine["calculate"]>) {
  return result.overlays.find(
    (overlay) =>
      overlay.source.chart === "chart-a" && overlay.source.body === "sun",
  )!;
}

function replaceSun(values: readonly number[], longitude: number) {
  return values.map((value, index) => (index === 0 ? longitude : value));
}

function chart(providerId: string, longitudes: readonly number[]): NatalChart {
  const result = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
  result.input.timezoneSource = "private overlay timezone source fixture";
  result.input.coordinateSource = "private overlay coordinate source fixture";
  result.metadata.positionProvider.providerId = providerId;
  result.metadata.positionProvider.providerVersion = "fixture-1.0.0";
  result.metadata.positionProvider.dataVersion = "fixture-data-1.0.0";
  result.placements = result.placements.map((placement, index) => {
    const longitude = longitudes[index]!;
    return {
      ...placement,
      eclipticLongitudeDegrees: longitude,
      speedLongitudeDegreesPerDay: index + 1,
      zodiac: toZodiacPosition(longitude),
      houseNumber: findHouseNumber(
        longitude,
        result.houses.cuspsLongitudeDegrees,
      ),
    };
  });
  result.aspects = calculateNatalAspects(
    result.placements,
    result.metadata.aspectPolicy.definitions,
  );
  return result;
}
