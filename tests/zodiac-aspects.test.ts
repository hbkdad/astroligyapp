import { describe, expect, it } from "vitest";

import {
  findClosestAspect,
  minimalAngularSeparation,
} from "@/domain/astro/aspects";
import {
  normalizeLongitude,
  toZodiacPosition,
  ZODIAC_SIGNS,
} from "@/domain/astro/zodiac";

describe("zodiac longitude normalization", () => {
  it.each([
    [0, 0],
    [360, 0],
    [720, 0],
    [-360, 0],
    [-0.001, 359.999],
    [360.001, 0.0009999999999763531],
  ])("normalizes %s degrees to [0, 360)", (input, expected) => {
    expect(normalizeLongitude(input)).toBeCloseTo(expected, 12);
  });

  it("maps every exact 30-degree boundary to the next sign", () => {
    for (let index = 0; index < ZODIAC_SIGNS.length; index += 1) {
      expect(toZodiacPosition(index * 30)).toEqual({
        longitudeDegrees: index * 30,
        signIndex: index,
        sign: ZODIAC_SIGNS[index],
        degreeWithinSign: 0,
      });
    }
  });

  it("keeps just-below-boundary values in the prior sign", () => {
    expect(toZodiacPosition(29.999999)).toMatchObject({
      sign: "aries",
      signIndex: 0,
    });
    expect(toZodiacPosition(359.999999)).toMatchObject({
      sign: "pisces",
      signIndex: 11,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite longitude %s",
    (input) => expect(() => normalizeLongitude(input)).toThrow(RangeError),
  );
});

describe("aspect detection", () => {
  it.each([
    [359, 1, 2],
    [1, 359, 2],
    [10, 190, 180],
    [-10, 10, 20],
    [720, 90, 90],
  ])("finds minimal separation for %s and %s", (first, second, expected) => {
    expect(minimalAngularSeparation(first, second)).toBe(expected);
  });

  it.each([
    [0, 0, "conjunction"],
    [0, 60, "sextile"],
    [0, 90, "square"],
    [0, 120, "trine"],
    [0, 180, "opposition"],
  ] as const)("detects exact %s/%s as %s", (first, second, type) => {
    expect(findClosestAspect(first, second)).toMatchObject({
      type,
      orbDegrees: 0,
      normalizedStrength: 1,
    });
  });

  it("includes the orb boundary and excludes the first value outside it", () => {
    expect(findClosestAspect(0, 65)?.type).toBe("sextile");
    expect(findClosestAspect(0, 65.000001)).toBeNull();
    expect(findClosestAspect(0, 83)?.type).toBe("square");
    expect(findClosestAspect(0, 82.999999)).toBeNull();
  });

  it("is symmetric and chooses the closest configured aspect", () => {
    expect(findClosestAspect(4, 356)).toEqual(findClosestAspect(356, 4));
    expect(
      findClosestAspect(0, 75, [
        { type: "sextile", exactAngleDegrees: 60, maximumOrbDegrees: 20 },
        { type: "square", exactAngleDegrees: 90, maximumOrbDegrees: 20 },
      ])?.type,
    ).toBe("sextile");
  });

  it("classifies applying, separating, stationary, and unknown motion", () => {
    expect(
      findClosestAspect(0, 62, undefined, {
        firstSpeedDegreesPerDay: 0,
        secondSpeedDegreesPerDay: -1,
      })?.phase,
    ).toBe("applying");
    expect(
      findClosestAspect(0, 62, undefined, {
        firstSpeedDegreesPerDay: 0,
        secondSpeedDegreesPerDay: 1,
      })?.phase,
    ).toBe("separating");
    expect(
      findClosestAspect(0, 62, undefined, {
        firstSpeedDegreesPerDay: 1,
        secondSpeedDegreesPerDay: 1,
      })?.phase,
    ).toBe("stationary");
    expect(findClosestAspect(0, 62)?.phase).toBe("unknown");
  });

  it("rejects invalid aspect configuration", () => {
    expect(() => findClosestAspect(0, 0, [])).toThrow(RangeError);
    expect(() =>
      findClosestAspect(0, 0, [
        {
          type: "conjunction",
          exactAngleDegrees: 0,
          maximumOrbDegrees: -1,
        },
      ]),
    ).toThrow(RangeError);
  });
});
