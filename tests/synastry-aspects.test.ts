import { describe, expect, it } from "vitest";

import {
  calculateNatalAspects,
  type NatalChart,
} from "@/application/calculate-natal-chart";
import {
  InvalidSynastryInputError,
  SynastryAspectEngine,
} from "@/application/calculate-synastry-aspects";
import { CELESTIAL_BODIES } from "@/domain/astro/contracts";
import { findHouseNumber } from "@/domain/astro/house-strategies";
import { toZodiacPosition } from "@/domain/astro/zodiac";
import { ZOLLIKON_NATAL_CHART_DEMO } from "@/presentation/natal-chart-demo";

const BASE_LONGITUDES = [0, 18, 37, 59, 83, 111, 147, 191, 239, 301];

describe("deterministic cross-chart synastry aspects", () => {
  it("evaluates all 100 canonical body pairs with stable unique identity", () => {
    const engine = new SynastryAspectEngine({
      id: "all-pairs-test",
      version: "1.0.0",
      definitions: [
        { type: "conjunction", exactAngleDegrees: 0, maximumOrbDegrees: 180 },
      ],
    });
    const result = engine.calculate(
      chart("fixture-a", BASE_LONGITUDES),
      chart(
        "fixture-b",
        BASE_LONGITUDES.map((value) => (value + 11) % 360),
      ),
    );

    expect(result.aspects).toHaveLength(100);
    expect(new Set(result.aspects.map((aspect) => aspect.id)).size).toBe(100);
    expect(result.aspects[0]).toMatchObject({
      id: "synastry:chart-a:sun:chart-b:sun:conjunction",
      first: { chart: "chart-a", body: "sun" },
      second: { chart: "chart-b", body: "sun" },
    });
    expect(result.aspects.at(-1)).toMatchObject({
      id: "synastry:chart-a:pluto:chart-b:pluto:conjunction",
    });
    expect(
      result.aspects.map((aspect) => [
        CELESTIAL_BODIES.indexOf(aspect.first.body),
        CELESTIAL_BODIES.indexOf(aspect.second.body),
      ]),
    ).toEqual(
      CELESTIAL_BODIES.flatMap((_, firstIndex) =>
        CELESTIAL_BODIES.map((__, secondIndex) => [firstIndex, secondIndex]),
      ),
    );
  });

  it("is byte-equivalent when the two input charts reverse", () => {
    const first = chart("fixture-a", BASE_LONGITUDES);
    const second = chart(
      "fixture-b",
      BASE_LONGITUDES.map((value) => (value + 73) % 360),
    );
    const engine = new SynastryAspectEngine();
    const forward = engine.calculate(first, second);
    const reversed = engine.calculate(second, first);

    expect(reversed).toEqual(forward);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
    expect(
      forward.charts.map((source) => source.positionProvider.providerId),
    ).toEqual(["fixture-a", "fixture-b"]);
  });

  it.each([
    [90, 0, 1, "separating"],
    [96.999999, 6.999999, 1 / 7_000_000, "applying"],
    [97, 7, 0, "applying"],
  ] as const)(
    "includes square boundary %s with exact orb and strength",
    (secondSun, orb, strength, phase) => {
      const result = squareEngine().calculate(
        chart("fixture-a", replaceSun(BASE_LONGITUDES, 0), true),
        chart("fixture-b", replaceSun(BASE_LONGITUDES, secondSun), true, -1),
      );
      const aspect = findSunToSun(result);
      expect(aspect).toMatchObject({
        type: "square",
        actualAngleDegrees: secondSun,
        phase,
      });
      expect(aspect?.orbDegrees).toBeCloseTo(orb, 12);
      expect(aspect?.normalizedStrength).toBeCloseTo(strength, 12);
    },
  );

  it("excludes a just-outside orb and handles angular wraparound", () => {
    const outside = squareEngine().calculate(
      chart("fixture-a", replaceSun(BASE_LONGITUDES, 0)),
      chart("fixture-b", replaceSun(BASE_LONGITUDES, 97.000001)),
    );
    expect(findSunToSun(outside)).toBeUndefined();

    const wrapped = new SynastryAspectEngine({
      id: "wrap-test",
      version: "1.0.0",
      definitions: [
        { type: "conjunction", exactAngleDegrees: 0, maximumOrbDegrees: 3 },
      ],
    }).calculate(
      chart("fixture-a", replaceSun(BASE_LONGITUDES, 359)),
      chart("fixture-b", replaceSun(BASE_LONGITUDES, 1)),
    );
    const wrappedAspect = findSunToSun(wrapped);
    expect(wrappedAspect).toMatchObject({
      actualAngleDegrees: 2,
      orbDegrees: 2,
    });
    expect(wrappedAspect?.normalizedStrength).toBeCloseTo(1 / 3, 12);
  });

  it("marks phase unknown when either source speed is absent", () => {
    const result = squareEngine().calculate(
      chart("fixture-a", replaceSun(BASE_LONGITUDES, 0), false),
      chart("fixture-b", replaceSun(BASE_LONGITUDES, 90), true),
    );
    expect(findSunToSun(result)?.phase).toBe("unknown");
  });

  it("reports stationary relative motion and selects the closest overlapping aspect", () => {
    const result = new SynastryAspectEngine({
      id: "closest-overlap-test",
      version: "1.0.0",
      definitions: [
        { type: "conjunction", exactAngleDegrees: 0, maximumOrbDegrees: 100 },
        { type: "square", exactAngleDegrees: 90, maximumOrbDegrees: 100 },
      ],
    }).calculate(
      chart("fixture-a", replaceSun(BASE_LONGITUDES, 0)),
      chart("fixture-b", replaceSun(BASE_LONGITUDES, 80)),
    );
    expect(findSunToSun(result)).toMatchObject({
      type: "square",
      orbDegrees: 10,
      phase: "stationary",
    });
  });

  it("returns complete calculation provenance without raw birth inputs", () => {
    const first = chart("fixture-a", BASE_LONGITUDES);
    first.input.instant = "1991-02-03T04:05:06Z";
    first.input.timezone = "America/Toronto";
    first.input.timezoneSource = "private-timezone-marker";
    first.input.coordinateSource = "private-coordinate-marker";
    first.input.observer = {
      latitudeDegrees: 48.4758,
      longitudeDegrees: -81.3305,
      elevationMeters: 300,
    };
    const result = new SynastryAspectEngine().calculate(
      first,
      chart("fixture-b", BASE_LONGITUDES),
    );

    expect(result).toMatchObject({
      version: "1.0.0",
      engine: {
        id: "deterministic-cross-chart-aspects",
        version: "1.0.0",
      },
      aspectPolicy: {
        id: "cross-chart-major-aspects",
        version: "1.0.0",
      },
    });
    expect(result.charts[0]).toMatchObject({
      side: "chart-a",
      chartEngineVersion: "1.0.0",
      positionProvider: {
        providerId: "fixture-a",
        providerVersion: "fixture-1.0.0",
        dataVersion: "fixture-data-1.0.0",
        timeScale: "utc",
        referenceFrame: "ecliptic-of-date",
        zodiacReference: "tropical",
        coordinateOrigin: "topocentric",
      },
      placements: expect.arrayContaining([
        {
          body: "sun",
          eclipticLongitudeDegrees: 0,
          speedLongitudeDegreesPerDay: 1,
        },
      ]),
    });
    expect(result.disclaimer).toContain("not a compatibility score");
    expect(JSON.stringify(result)).not.toMatch(
      /1991-02-03|America\/Toronto|private-timezone-marker|private-coordinate-marker|48\.4758|-81\.3305|observer|timezone|coordinateSource|house/,
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.aspects)).toBe(true);
    expect(Object.isFrozen(result.charts[0].placements)).toBe(true);
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
      "duplicate body",
      (value: NatalChart) => {
        (value.placements[1] as { body: string }).body = "sun";
        return value;
      },
    ],
    [
      "chart version drift",
      (value: NatalChart) => {
        value.metadata.chartEngineVersion = "2.0.0";
        return value;
      },
    ],
    [
      "aspect policy version drift",
      (value: NatalChart) => {
        (value.metadata.aspectPolicy as { version: string }).version = "2.0.0";
        return value;
      },
    ],
    [
      "provider version loss",
      (value: NatalChart) => {
        value.metadata.positionProvider.providerVersion = "";
        return value;
      },
    ],
    [
      "private source corruption",
      (value: NatalChart) => {
        value.input.coordinateSource = "";
        return value;
      },
    ],
    [
      "calculation instant corruption",
      (value: NatalChart) => {
        value.metadata.calculatedAt = "not-an-instant";
        return value;
      },
    ],
    [
      "birth instant corruption",
      (value: NatalChart) => {
        value.input.instant = "2026-02-31T00:00:00Z";
        return value;
      },
    ],
    [
      "observer corruption",
      (value: NatalChart) => {
        value.input.observer.latitudeDegrees = Number.NaN;
        return value;
      },
    ],
    [
      "coordinate-origin corruption",
      (value: NatalChart) => {
        (value.input as { coordinateOrigin: string }).coordinateOrigin =
          "browser-owned";
        return value;
      },
    ],
    [
      "zodiac corruption",
      (value: NatalChart) => {
        value.placements[0]!.zodiac.sign = "pisces";
        return value;
      },
    ],
    [
      "house corruption",
      (value: NatalChart) => {
        value.placements[0]!.houseNumber = 12;
        return value;
      },
    ],
    [
      "natal aspect corruption",
      (value: NatalChart) => {
        value.aspects[0]!.orbDegrees += 0.1;
        return value;
      },
    ],
    [
      "natal aspect loss",
      (value: NatalChart) => {
        (value.aspects as NatalChart["aspects"][number][]).pop();
        return value;
      },
    ],
  ] as const)("fails generically on %s", (_, corrupt) => {
    const candidate = corrupt(chart("fixture-a", BASE_LONGITUDES));
    expect(() =>
      new SynastryAspectEngine().calculate(
        candidate,
        chart("fixture-b", BASE_LONGITUDES),
      ),
    ).toThrow(InvalidSynastryInputError);
    expect(() =>
      new SynastryAspectEngine().calculate(
        candidate,
        chart("fixture-b", BASE_LONGITUDES),
      ),
    ).toThrow("Synastry input is invalid or unsupported");
  });

  it("rejects invalid declared policies before chart evaluation", () => {
    expect(
      () =>
        new SynastryAspectEngine({
          id: " bad ",
          version: "1.0.0",
          definitions: [],
        }),
    ).toThrow("Synastry aspect policy is invalid");
    expect(
      () =>
        new SynastryAspectEngine({
          id: "duplicate-test",
          version: "1.0.0",
          definitions: [
            { type: "square", exactAngleDegrees: 90, maximumOrbDegrees: 7 },
            { type: "square", exactAngleDegrees: 90, maximumOrbDegrees: 8 },
          ],
        }),
    ).toThrow(InvalidSynastryInputError);
  });
});

function squareEngine() {
  return new SynastryAspectEngine({
    id: "square-boundary-test",
    version: "1.0.0",
    definitions: [
      { type: "square", exactAngleDegrees: 90, maximumOrbDegrees: 7 },
    ],
  });
}

function findSunToSun(result: ReturnType<SynastryAspectEngine["calculate"]>) {
  return result.aspects.find(
    (aspect) => aspect.first.body === "sun" && aspect.second.body === "sun",
  );
}

function replaceSun(values: readonly number[], longitude: number) {
  return values.map((value, index) => (index === 0 ? longitude : value));
}

function chart(
  providerId: string,
  longitudes: readonly number[],
  includeSpeeds = true,
  speedOffset = 0,
): NatalChart {
  const result = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
  result.input.timezoneSource = "private timezone source fixture";
  result.input.coordinateSource = "private coordinate source fixture";
  result.metadata.positionProvider.providerId = providerId;
  result.metadata.positionProvider.providerVersion = "fixture-1.0.0";
  result.metadata.positionProvider.dataVersion = "fixture-data-1.0.0";
  result.placements = result.placements.map((placement, index) => {
    const longitude = longitudes[index]!;
    const updated = {
      ...placement,
      eclipticLongitudeDegrees: longitude,
      zodiac: toZodiacPosition(longitude),
      houseNumber: findHouseNumber(
        longitude,
        result.houses.cuspsLongitudeDegrees,
      ),
    };
    if (!includeSpeeds) delete updated.speedLongitudeDegreesPerDay;
    else updated.speedLongitudeDegreesPerDay = index + 1 + speedOffset;
    return updated;
  });
  result.aspects = calculateNatalAspects(
    result.placements,
    result.metadata.aspectPolicy.definitions,
  );
  return result;
}
