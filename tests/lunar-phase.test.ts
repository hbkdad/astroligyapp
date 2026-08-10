import { describe, expect, it } from "vitest";

import {
  deriveLunarPhase,
  LUNAR_PHASES,
  MEAN_SYNODIC_MONTH_DAYS,
} from "@/domain/lunar/phase";

describe("lunar phase geometry", () => {
  it("normalizes Moon minus Sun longitude across zero", () => {
    expect(deriveLunarPhase(350, 10).phaseAngleDegrees).toBe(20);
    expect(deriveLunarPhase(10, 350).phaseAngleDegrees).toBe(340);
  });

  it("classifies all eight exact 45-degree phase anchors", () => {
    for (let index = 0; index < LUNAR_PHASES.length; index += 1) {
      const result = deriveLunarPhase(12, 12 + index * 45);
      expect(result).toMatchObject({
        phase: LUNAR_PHASES[index],
        phaseAngleDegrees: index * 45,
        phaseAnchorDegrees: index * 45,
      });
    }
  });

  it.each([
    [22.499999, "new-moon"],
    [22.5, "waxing-crescent"],
    [67.499999, "waxing-crescent"],
    [67.5, "first-quarter"],
    [157.499999, "waxing-gibbous"],
    [157.5, "full-moon"],
    [202.499999, "full-moon"],
    [202.5, "waning-gibbous"],
    [337.499999, "waning-crescent"],
    [337.5, "new-moon"],
  ] as const)("classifies sector boundary %s as %s", (angle, phase) => {
    expect(deriveLunarPhase(0, angle).phase).toBe(phase);
  });

  it.each([
    [0, 0],
    [90, 0.5],
    [180, 1],
    [270, 0.5],
  ])("estimates illumination at %s degrees", (angle, expected) => {
    expect(
      deriveLunarPhase(0, angle).approximateIlluminatedFraction,
    ).toBeCloseTo(expected, 12);
  });

  it("increases illumination while waxing and decreases while waning", () => {
    const waxing = [0, 30, 60, 90, 120, 150, 180].map(
      (angle) => deriveLunarPhase(0, angle).approximateIlluminatedFraction,
    );
    const waning = [180, 210, 240, 270, 300, 330, 359.999].map(
      (angle) => deriveLunarPhase(0, angle).approximateIlluminatedFraction,
    );

    expect(waxing).toEqual([...waxing].sort((left, right) => left - right));
    expect(waning).toEqual([...waning].sort((left, right) => right - left));
  });

  it("labels waxing, waning, and illumination turning points", () => {
    expect(deriveLunarPhase(0, 0).illuminationTrend).toBe("turning");
    expect(deriveLunarPhase(0, 90).illuminationTrend).toBe("waxing");
    expect(deriveLunarPhase(0, 180).illuminationTrend).toBe("turning");
    expect(deriveLunarPhase(0, 270).illuminationTrend).toBe("waning");
  });

  it("reports mean-cycle age explicitly as an estimate", () => {
    expect(deriveLunarPhase(0, 0).estimatedAgeDays).toBe(0);
    expect(deriveLunarPhase(0, 180).estimatedAgeDays).toBeCloseTo(
      MEAN_SYNODIC_MONTH_DAYS / 2,
      10,
    );
    expect(deriveLunarPhase(0, 359.999).estimatedAgeDays).toBeLessThan(
      MEAN_SYNODIC_MONTH_DAYS,
    );
  });

  it("returns the Moon sign from its own normalized longitude", () => {
    expect(deriveLunarPhase(100, -0.001).moonZodiac).toMatchObject({
      sign: "pisces",
      signIndex: 11,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid solar or lunar longitude %s",
    (value) => {
      expect(() => deriveLunarPhase(value, 0)).toThrow(RangeError);
      expect(() => deriveLunarPhase(0, value)).toThrow(RangeError);
    },
  );
});
