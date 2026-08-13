import { describe, expect, it } from "vitest";

import { buildNumerologyContext } from "@/application/build-numerology-context";
import { CONTEXT_NUMEROLOGY_KEYS } from "@/domain/context/contracts";

describe("saved-profile numerology context", () => {
  it("calculates every required fact for the trusted local day", () => {
    const context = buildNumerologyContext(
      "1990-07-15",
      "Pythagoras",
      "2025-12-31",
    );
    expect(context.effectiveDate).toBe("2025-12-31");
    expect(Object.keys(context.results).sort()).toEqual(
      [...CONTEXT_NUMEROLOGY_KEYS].sort(),
    );
    expect(context.results["life-path"].value).toBe(5);
    expect(context.results.expression.value).toBe(4);
    expect(context.results["soul-urge"].value).toBe(8);
    expect(context.results.personality.value).toBe(5);
    expect(context.results["personal-day"].strategyVersion).toBe("1.0.0");
  });

  it("rejects unsupported name characters instead of approximating", () => {
    expect(() =>
      buildNumerologyContext("1990-07-15", "Mira 李", "2025-12-31"),
    ).toThrow("Unsupported name character");
  });
});
