import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NatalChartView } from "@/components/natal-chart-view";
import {
  DEMO_NATAL_CHART,
  ZOLLIKON_NATAL_CHART_DEMO,
} from "@/presentation/natal-chart-demo";
import {
  NATAL_CHART_READ_MODEL_VERSION,
  pointAtLongitude,
  toNatalChartReadModel,
} from "@/presentation/natal-chart-read-model";
import referenceValues from "./fixtures/ephemeris/reference-values.json";
import houseReference from "./fixtures/ephemeris/whole-sign-house-reference.json";

describe("natal chart presentation boundary", () => {
  it("maps every validated placement and aspect without changing source facts", () => {
    const before = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
    expect(DEMO_NATAL_CHART).toMatchObject({
      version: NATAL_CHART_READ_MODEL_VERSION,
      title: "Natal chart",
      subtitle: "September 30, 1997 · 14:00 UTC · Europe/Zurich",
    });
    expect(DEMO_NATAL_CHART.placements).toHaveLength(10);
    expect(DEMO_NATAL_CHART.aspects).toHaveLength(14);
    expect(DEMO_NATAL_CHART.houses).toHaveLength(12);
    expect(DEMO_NATAL_CHART.signs).toHaveLength(12);
    expect(DEMO_NATAL_CHART.axes.map((axis) => axis.startLabel)).toEqual([
      "ASC",
      "MC",
    ]);
    expect(DEMO_NATAL_CHART.placements[0]).toMatchObject({
      body: "sun",
      sign: "libra",
      degreeLabel: "7.44° Libra",
      houseNumber: 10,
      longitudeLabel: "187.44° tropical longitude",
    });
    expect(ZOLLIKON_NATAL_CHART_DEMO).toEqual(before);
    expect(Object.isFrozen(DEMO_NATAL_CHART)).toBe(true);
    expect(Object.isFrozen(DEMO_NATAL_CHART.placements)).toBe(true);
  });

  it("retains all calculation and provider trace versions", () => {
    expect(DEMO_NATAL_CHART.trace).toEqual(
      expect.arrayContaining([
        { label: "Chart engine", value: "1.0.0" },
        { label: "Position provider", value: "astronomy-engine 2.1.19" },
        {
          label: "Position data",
          value: "astronomy-engine-model-2.1.19",
        },
        { label: "House strategy", value: "whole-sign 1.0.0" },
        { label: "Aspect policy", value: "major-aspects 1.0.0" },
        { label: "Coordinate origin", value: "topocentric" },
      ]),
    );
  });

  it("keeps the sourced demo inside fixed JPL and Swiss acceptance tolerances", () => {
    const reference = referenceValues.cases.find(
      (item) => item.id === "swiss-whole-sign-zollikon",
    )!;
    for (const placement of ZOLLIKON_NATAL_CHART_DEMO.placements) {
      const expected = reference.bodies[placement.body].expected;
      expect(
        circularDifference(
          placement.eclipticLongitudeDegrees,
          expected.eclipticLongitudeDegrees,
        ),
        placement.body,
      ).toBeLessThanOrEqual(0.02);
    }
    expect(
      circularDifference(
        ZOLLIKON_NATAL_CHART_DEMO.houses.ascendantLongitudeDegrees,
        houseReference.case.expected.ascendantLongitudeDegrees,
      ),
    ).toBeLessThanOrEqual(houseReference.toleranceDegrees);
    expect(
      circularDifference(
        ZOLLIKON_NATAL_CHART_DEMO.houses.midheavenLongitudeDegrees,
        houseReference.case.expected.midheavenLongitudeDegrees,
      ),
    ).toBeLessThanOrEqual(houseReference.toleranceDegrees);
    expect(ZOLLIKON_NATAL_CHART_DEMO.houses.cuspsLongitudeDegrees).toEqual(
      houseReference.case.expected.cuspsLongitudeDegrees,
    );
  });

  it.each([
    [0, { x: 300, y: 200 }],
    [90, { x: 400, y: 300 }],
    [180, { x: 300, y: 400 }],
    [270, { x: 200, y: 300 }],
  ])(
    "maps exact %s° longitude to the declared clockwise orientation",
    (longitude, expected) => {
      expect(pointAtLongitude(longitude, 100)).toEqual(expected);
    },
  );

  it("keeps 359.999° near but explicitly below the 0° boundary", () => {
    const point = pointAtLongitude(359.999, 100);
    expect(point.x).toBeLessThan(300);
    expect(point.x).toBeGreaterThan(299.99);
    expect(point.y).toBeCloseTo(200, 3);
  });

  it.each([-0.001, 360, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-normalized layout longitude %s",
    (longitude) => {
      expect(() => pointAtLongitude(longitude, 100)).toThrow(
        "normalized longitude",
      );
    },
  );

  it("renders a linked SVG and complete authoritative data tables", () => {
    const html = renderToStaticMarkup(
      <NatalChartView state={{ status: "ready", model: DEMO_NATAL_CHART }} />,
    );
    expect(html).toContain("<title>Sun Trine Jupiter, orb 4.75°</title>");
    expect(html).toContain('role="img"');
    expect(html).toContain("Accessible tropical natal chart wheel");
    expect(html).toContain("Complete values follow in tables");
    expect(html.match(/class="planet-node"/g)).toHaveLength(10);
    expect(html).toContain('href="#placement-sun"');
    expect(html).toContain('id="placement-sun"');
    expect(html).toContain("Natal placements table");
    expect(html).toContain("Natal aspects table");
    expect(html).toContain("ASC");
    expect(html).toContain("DSC");
    expect(html).toContain("MC");
    expect(html).toContain("IC");
    expect(html).toContain(
      "performs no ephemeris, zodiac, house, or aspect calculation",
    );
  });

  it.each([
    { status: "loading" as const },
    {
      status: "unavailable" as const,
      message: "An exact birth time is required for houses and angles.",
    },
    { status: "error" as const, message: "Provider result unavailable." },
  ])("renders the $status chart state deliberately", (state) => {
    const html = renderToStaticMarkup(<NatalChartView state={state} />);
    expect(html).toContain("<main");
    expect(html).toContain(state.status === "loading" ? "polite" : "assertive");
    expect(html).toContain("Return to Today");
  });

  it("fails closed on missing bodies, invalid longitudes, houses, aspects, and versions", () => {
    const missing = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
    (missing.placements as unknown as unknown[]).pop();
    expect(() => toNatalChartReadModel(missing)).toThrow(
      "every supported body",
    );

    const longitude = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
    (
      longitude.placements[0] as unknown as {
        eclipticLongitudeDegrees: number;
      }
    ).eclipticLongitudeDegrees = 360;
    expect(() => toNatalChartReadModel(longitude)).toThrow(
      "invalid normalized facts",
    );

    const houses = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
    (houses.houses.cuspsLongitudeDegrees as unknown as unknown[]).pop();
    expect(() => toNatalChartReadModel(houses)).toThrow("twelve house cusps");

    const aspect = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
    (
      aspect.aspects[0] as unknown as {
        orbDegrees: number;
      }
    ).orbDegrees = 99;
    expect(() => toNatalChartReadModel(aspect)).toThrow("invalid aspect facts");

    const version = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
    (
      version.metadata.positionProvider as { providerVersion: string }
    ).providerVersion = "";
    expect(() => toNatalChartReadModel(version)).toThrow(
      "trace versions are required",
    );
  });
});

function circularDifference(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
}
