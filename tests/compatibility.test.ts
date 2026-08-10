import { describe, expect, it } from "vitest";

import { ZODIAC_SIGNS, type ZodiacSign } from "@/domain/astro/zodiac";
import {
  InvalidCompatibilityInputError,
  PhaseOneCompatibilityStrategy,
  SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES,
} from "@/domain/compatibility/phase-one";
import type { NumerologyResult } from "@/domain/numerology/contracts";
import { PythagoreanNumerology } from "@/domain/numerology/pythagorean";

const strategy = new PhaseOneCompatibilityStrategy();

describe("phase-one compatibility facts", () => {
  it("classifies every zodiac sign and remains exactly symmetric for every pair", () => {
    for (const first of ZODIAC_SIGNS) {
      for (const second of ZODIAC_SIGNS) {
        const forward = strategy.compare(request(first, second, 1, 9));
        const reversed = strategy.compare(request(second, first, 9, 1));
        expect(reversed).toEqual(forward);
        expect(forward.zodiac.signs.values).toEqual(
          [first, second].sort(
            (left, right) =>
              ZODIAC_SIGNS.indexOf(left) - ZODIAC_SIGNS.indexOf(right),
          ),
        );
      }
    }
  });

  it("uses the complete declared element and modality table", () => {
    const expected = [
      ["aries", "fire", "cardinal"],
      ["taurus", "earth", "fixed"],
      ["gemini", "air", "mutable"],
      ["cancer", "water", "cardinal"],
      ["leo", "fire", "fixed"],
      ["virgo", "earth", "mutable"],
      ["libra", "air", "cardinal"],
      ["scorpio", "water", "fixed"],
      ["sagittarius", "fire", "mutable"],
      ["capricorn", "earth", "cardinal"],
      ["aquarius", "air", "fixed"],
      ["pisces", "water", "mutable"],
    ] as const;
    for (const [sign, element, modality] of expected) {
      const result = strategy.compare(request(sign, sign, 1, 1));
      expect(result.zodiac.elements.values).toEqual([element, element]);
      expect(result.zodiac.modalities.values).toEqual([modality, modality]);
      expect(result.zodiac.signs.equal).toBe(true);
    }
  });

  it("compares every supported numerology value pair symmetrically", () => {
    for (const first of SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES) {
      for (const second of SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES) {
        const forward = strategy.compare(
          request("aries", "pisces", first, second),
        );
        const reversed = strategy.compare(
          request("pisces", "aries", second, first),
        );
        expect(reversed).toEqual(forward);
        expect(forward.numerology.lifePath).toEqual({
          values: [first, second].sort((a, b) => a - b),
          equal: first === second,
          masterNumberCount:
            Number([11, 22, 33].includes(first)) +
            Number([11, 22, 33].includes(second)),
        });
      }
    }
  });

  it("emits only canonical facts, complete versions, trace, and a claims boundary", () => {
    const result = strategy.compare(request("leo", "aries", 11, 5));
    expect(result).toMatchObject({
      version: "1.0.0",
      strategy: { id: "phase-one-comparison", version: "1.0.0" },
      zodiacPolicy: {
        id: "tropical-element-modality",
        version: "1.0.0",
      },
      numerologySource: {
        strategyId: "pythagorean",
        strategyVersion: "1.0.0",
      },
      zodiac: {
        signs: { values: ["aries", "leo"], equal: false },
        elements: { values: ["fire", "fire"], equal: true },
        modalities: { values: ["cardinal", "fixed"], equal: false },
      },
      numerology: {
        lifePath: { values: [5, 11], equal: false, masterNumberCount: 1 },
      },
    });
    expect(result.trace.map((step) => step.operation)).toEqual([
      "canonicalize-zodiac-signs",
      "compare-zodiac-elements",
      "compare-zodiac-modalities",
      "compare-life-path-values",
      "compare-expression-values",
    ]);
    expect(result.disclaimer).toContain("not a relationship score");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.trace)).toBe(true);
  });

  it("accepts real traced Pythagorean results without returning raw tokens or traces", () => {
    const numerology = new PythagoreanNumerology();
    const first = {
      zodiacSign: "aries" as const,
      lifePath: numerology.calculateLifePath("1990-07-15"),
      expression: numerology.calculateExpression("Pythagoras"),
    };
    const second = {
      zodiacSign: "libra" as const,
      lifePath: numerology.calculateLifePath("1984-11-22"),
      expression: numerology.calculateExpression("Ada Lovelace"),
    };
    const result = strategy.compare({ first, second });
    expect(result.numerology.lifePath.values).toEqual([1, 5]);
    expect(JSON.stringify(result)).not.toMatch(
      /1990|1984|Pythagoras|Lovelace|tokens|reduce-life-path/,
    );
  });

  it.each([
    () => null as never,
    () => request("ophiuchus" as ZodiacSign, "aries", 1, 2),
    () => corrupted("value", 10),
    () => corrupted("masterNumber", true),
    () => corrupted("strategyId", "other"),
    () => corrupted("strategyVersion", "2.0.0"),
    () => corrupted("tokens", []),
    () => corrupted("tokenSource", " private "),
    () => corrupted("trace", []),
    () => corrupted("traceOperation", ""),
    () => corrupted("traceResult", 9),
  ])("rejects malformed or version-drift input generically", (makeRequest) => {
    expect(() => strategy.compare(makeRequest())).toThrow(
      InvalidCompatibilityInputError,
    );
    expect(() => strategy.compare(makeRequest())).toThrow(
      "Compatibility input is invalid or unsupported",
    );
  });

  it("validates configured numerology expectations", () => {
    expect(
      () =>
        new PhaseOneCompatibilityStrategy({ numerologyStrategyId: " bad " }),
    ).toThrow("expectation is invalid");
    expect(() =>
      new PhaseOneCompatibilityStrategy({
        numerologyStrategyVersion: "2.0.0",
      }).compare(request("aries", "taurus", 1, 2)),
    ).toThrow("invalid or unsupported");
  });
});

function request(
  firstSign: ZodiacSign,
  secondSign: ZodiacSign,
  firstValue: number,
  secondValue: number,
) {
  return {
    first: subject(firstSign, firstValue),
    second: subject(secondSign, secondValue),
  };
}

function subject(zodiacSign: ZodiacSign, value: number) {
  return {
    zodiacSign,
    lifePath: numerologyResult(value),
    expression: numerologyResult(value),
  };
}

function numerologyResult(value: number): NumerologyResult {
  return {
    value,
    masterNumber: [11, 22, 33].includes(value),
    tokens: [{ source: "private-source-marker", normalized: "PRIVATE", value }],
    trace: [{ operation: "fixture-reduction", inputs: [value], result: value }],
    strategyId: "pythagorean",
    strategyVersion: "1.0.0",
  };
}

function corrupted(
  field:
    | "value"
    | "masterNumber"
    | "strategyId"
    | "strategyVersion"
    | "tokens"
    | "tokenSource"
    | "trace"
    | "traceOperation"
    | "traceResult",
  value: unknown,
) {
  const result = request("aries", "taurus", 1, 2);
  const lifePath = result.first.lifePath as unknown as Record<string, unknown>;
  if (field === "traceResult")
    (lifePath.trace as { result: unknown }[])[0]!.result = value;
  else if (field === "traceOperation")
    (lifePath.trace as { operation: unknown }[])[0]!.operation = value;
  else if (field === "tokenSource")
    (lifePath.tokens as { source: unknown }[])[0]!.source = value;
  else lifePath[field] = value;
  return result;
}
