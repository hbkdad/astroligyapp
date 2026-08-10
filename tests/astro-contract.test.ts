import { describe, expect, it } from "vitest";

import { CELESTIAL_BODIES } from "@/domain/astro/contracts";

describe("ephemeris contract", () => {
  it("exposes the required initial celestial bodies without duplicates", () => {
    expect(CELESTIAL_BODIES).toEqual([
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto",
    ]);
    expect(new Set(CELESTIAL_BODIES).size).toBe(CELESTIAL_BODIES.length);
  });
});
