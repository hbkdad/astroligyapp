import { describe, expect, it } from "vitest";

import {
  InvalidNumerologyInputError,
  PYTHAGOREAN_LETTER_VALUES,
  PythagoreanNumerology,
} from "@/domain/numerology/pythagorean";

const strategy = new PythagoreanNumerology();

describe("Pythagorean letter normalization", () => {
  it("implements the complete A-Z mapping", () => {
    expect(Object.keys(PYTHAGOREAN_LETTER_VALUES).sort().join("")).toBe(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    );
    expect(PYTHAGOREAN_LETTER_VALUES).toMatchObject({
      A: 1,
      J: 1,
      S: 1,
      B: 2,
      K: 2,
      T: 2,
      I: 9,
      R: 9,
    });
    for (const [value, letters] of [
      [1, "AJS"],
      [2, "BKT"],
      [3, "CLU"],
      [4, "DMV"],
      [5, "ENW"],
      [6, "FOX"],
      [7, "GPY"],
      [8, "HQZ"],
      [9, "IR"],
    ] as const) {
      for (const letter of letters) {
        expect(PYTHAGOREAN_LETTER_VALUES[letter]).toBe(value);
      }
    }
  });

  it("normalizes case, Latin diacritics, combining marks, spaces, and punctuation", () => {
    const plain = strategy.calculateExpression("Jose Lynn ONeil");
    const decorated = strategy.calculateExpression("José-Lynn O'Neil!");
    const combining = strategy.calculateExpression("Jose\u0301 Lynn ONeil");

    expect(decorated.value).toBe(plain.value);
    expect(combining.value).toBe(plain.value);
    expect(decorated.tokens.map((token) => token.normalized).join("")).toBe(
      "JOSELYNNONEIL",
    );
  });

  it.each(["李", "🙂", "A1"])(
    "rejects unsupported characters explicitly in %s",
    (name) =>
      expect(() => strategy.calculateExpression(name)).toThrow(
        InvalidNumerologyInputError,
      ),
  );

  it.each(["", " - ' "])("rejects empty normalized names", (name) => {
    expect(() => strategy.calculateExpression(name)).toThrow(
      InvalidNumerologyInputError,
    );
  });

  it("applies the configured Y vowel policy", () => {
    const yIsConsonant = new PythagoreanNumerology({ yVowelPolicy: "never" });
    const yIsVowel = new PythagoreanNumerology({ yVowelPolicy: "always" });

    expect(yIsConsonant.calculateSoulUrge("Pythagoras").value).toBe(8);
    expect(yIsConsonant.calculatePersonality("Pythagoras").value).toBe(5);
    expect(yIsVowel.calculateSoulUrge("Pythagoras").value).toBe(6);
    expect(yIsVowel.calculatePersonality("Pythagoras").value).toBe(7);
  });
});

describe("core numerology calculations", () => {
  it("uses component reduction for Life Path with a reconstructable trace", () => {
    const result = strategy.calculateLifePath("1990-07-15");
    expect(result).toMatchObject({
      value: 5,
      masterNumber: false,
      strategyId: "pythagorean",
      strategyVersion: "1.0.0",
    });
    expect(result.trace.at(-1)).toMatchObject({
      operation: "reduce-life-path",
      result: 5,
    });
  });

  it("calculates expression, soul urge, personality, birthday, and maturity", () => {
    expect(strategy.calculateExpression("Pythagoras").value).toBe(4);
    expect(strategy.calculateSoulUrge("Pythagoras").value).toBe(8);
    expect(strategy.calculatePersonality("Pythagoras").value).toBe(5);
    expect(strategy.calculateBirthday("1990-07-15").value).toBe(6);
    expect(strategy.calculateMaturity("1990-07-15", "Pythagoras").value).toBe(
      9,
    );
  });

  it.each([
    [11, 11, true],
    [22, 22, true],
    [33, 33, true],
  ])("preserves configured master total %s", (letterCount, value, master) => {
    const result = strategy.calculateExpression("A".repeat(letterCount));
    expect(result).toMatchObject({ value, masterNumber: master });
  });

  it("supports a convention that reduces master numbers", () => {
    const reducing = new PythagoreanNumerology({
      preserveMasterNumbers: false,
    });
    expect(reducing.calculateExpression("A".repeat(11))).toMatchObject({
      value: 2,
      masterNumber: false,
    });
    expect(reducing.calculateExpression("A".repeat(22)).value).toBe(4);
    expect(reducing.calculateExpression("A".repeat(33)).value).toBe(6);
  });

  it("preserves master values during date component reduction", () => {
    const result = strategy.calculateLifePath("1984-11-22");
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "reduce-month", result: 11 }),
        expect.objectContaining({ operation: "reduce-day", result: 22 }),
        expect.objectContaining({ operation: "reduce-year", result: 22 }),
      ]),
    );
    expect(result.value).toBe(1);
  });

  it.each([
    "2023-02-29",
    "2024-13-01",
    "2024-00-01",
    "0000-01-01",
    "not-a-date",
  ])("rejects invalid date %s", (date) => {
    expect(() => strategy.calculateLifePath(date)).toThrow(
      InvalidNumerologyInputError,
    );
  });

  it("accepts leap day and zero-containing dates", () => {
    expect(strategy.calculateLifePath("2000-02-29").value).toBe(6);
    expect(strategy.calculateLifePath("2001-10-10").value).toBe(5);
    expect(strategy.calculateLifePath("0099-01-01").value).toBe(11);
  });

  it("fails explicitly when a selected name category is empty", () => {
    expect(() => strategy.calculateSoulUrge("Rhythms")).toThrow(
      InvalidNumerologyInputError,
    );
    expect(() => strategy.calculatePersonality("AEIOU")).toThrow(
      InvalidNumerologyInputError,
    );
  });
});

describe("personal cycles", () => {
  it("calculates personal year, month, and day on plain calendar dates", () => {
    expect(strategy.calculatePersonalYear("1990-07-15", 2026).value).toBe(5);
    expect(strategy.calculatePersonalMonth("1990-07-15", 2026, 8).value).toBe(
      4,
    );
    expect(
      strategy.calculatePersonalDay("1990-07-15", "2026-08-09").value,
    ).toBe(4);
  });

  it("changes deterministically at year, month, and day boundaries", () => {
    expect(strategy.calculatePersonalYear("1990-07-15", 2025)).toMatchObject({
      value: 22,
      masterNumber: true,
    });
    expect(strategy.calculatePersonalYear("1990-07-15", 2026).value).toBe(5);
    expect(strategy.calculatePersonalMonth("1990-07-15", 2026, 7).value).toBe(
      3,
    );
    expect(strategy.calculatePersonalMonth("1990-07-15", 2026, 8).value).toBe(
      4,
    );
    expect(
      strategy.calculatePersonalDay("1990-07-15", "2026-08-08").value,
    ).toBe(3);
    expect(
      strategy.calculatePersonalDay("1990-07-15", "2026-08-09").value,
    ).toBe(4);
  });

  it.each([0, 13, 1.5])("rejects invalid personal month %s", (month) => {
    expect(() =>
      strategy.calculatePersonalMonth("1990-07-15", 2026, month),
    ).toThrow(InvalidNumerologyInputError);
  });

  it.each([0, 10_000, 2026.5])("rejects invalid personal year %s", (year) => {
    expect(() => strategy.calculatePersonalYear("1990-07-15", year)).toThrow(
      InvalidNumerologyInputError,
    );
  });
});
