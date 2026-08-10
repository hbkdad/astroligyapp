import { describe, expect, it } from "vitest";

import { WholeSignHouseStrategy } from "@/domain/astro/house-strategies";

const strategy = new WholeSignHouseStrategy();

describe("WholeSignHouseStrategy", () => {
  it.each(Array.from({ length: 12 }, (_, index) => index * 30))(
    "starts house one at the exact %d degree sign boundary",
    (boundary) => {
      expect(
        strategy.calculateCusps({
          ascendantLongitudeDegrees: boundary,
          midheavenLongitudeDegrees: 0,
        })[0],
      ).toBe(boundary);
    },
  );

  it.each(Array.from({ length: 12 }, (_, index) => (index + 1) * 30))(
    "keeps the prior sign immediately below %d degrees",
    (boundary) => {
      expect(
        strategy.calculateCusps({
          ascendantLongitudeDegrees: boundary - 1e-9,
          midheavenLongitudeDegrees: 0,
        })[0],
      ).toBe((boundary - 30) % 360);
    },
  );

  it("normalizes wraparound inputs and returns twelve normalized cusps", () => {
    const expected = [330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300];
    expect(
      strategy.calculateCusps({
        ascendantLongitudeDegrees: 359.999999,
        midheavenLongitudeDegrees: 0,
      }),
    ).toEqual(expected);
    expect(
      strategy.calculateCusps({
        ascendantLongitudeDegrees: -0.001,
        midheavenLongitudeDegrees: 0,
      }),
    ).toEqual(expected);
    expect(
      strategy.calculateCusps({
        ascendantLongitudeDegrees: 720,
        midheavenLongitudeDegrees: 0,
      })[0],
    ).toBe(0);
  });

  it.each([Number.NaN, Infinity, -Infinity])(
    "rejects non-finite ascendant %s",
    (ascendantLongitudeDegrees) => {
      expect(() =>
        strategy.calculateCusps({
          ascendantLongitudeDegrees,
          midheavenLongitudeDegrees: 0,
        }),
      ).toThrow(RangeError);
    },
  );
});
