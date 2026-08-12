import {
  type CompatibilityPairFact,
  type CompatibilityStrategy,
  type CompatibilityTraceStep,
  type NumerologyPairFact,
  type PhaseOneCompatibilityRequest,
  type PhaseOneCompatibilityResult,
  type ZodiacElement,
  type ZodiacModality,
} from "@/domain/compatibility/contracts";
import { ZODIAC_SIGNS, type ZodiacSign } from "@/domain/astro/zodiac";
import type { NumerologyResult } from "@/domain/numerology/contracts";

export const PHASE_ONE_COMPATIBILITY_RESULT_VERSION = "1.0.0";
export const PHASE_ONE_COMPATIBILITY_DISCLAIMER =
  "These are deterministic comparison facts, not a relationship score, prediction, or advice.";
export const ZODIAC_CLASSIFICATION_POLICY = Object.freeze({
  id: "tropical-element-modality",
  version: "1.0.0",
});
export const SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33,
] as const);

export const ZODIAC_CLASSIFICATIONS: Readonly<
  Record<
    ZodiacSign,
    Readonly<{ element: ZodiacElement; modality: ZodiacModality }>
  >
> = Object.freeze({
  aries: Object.freeze({ element: "fire", modality: "cardinal" }),
  taurus: Object.freeze({ element: "earth", modality: "fixed" }),
  gemini: Object.freeze({ element: "air", modality: "mutable" }),
  cancer: Object.freeze({ element: "water", modality: "cardinal" }),
  leo: Object.freeze({ element: "fire", modality: "fixed" }),
  virgo: Object.freeze({ element: "earth", modality: "mutable" }),
  libra: Object.freeze({ element: "air", modality: "cardinal" }),
  scorpio: Object.freeze({ element: "water", modality: "fixed" }),
  sagittarius: Object.freeze({ element: "fire", modality: "mutable" }),
  capricorn: Object.freeze({ element: "earth", modality: "cardinal" }),
  aquarius: Object.freeze({ element: "air", modality: "fixed" }),
  pisces: Object.freeze({ element: "water", modality: "mutable" }),
});

export class InvalidCompatibilityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCompatibilityInputError";
  }
}

export interface PhaseOneCompatibilityStrategyOptions {
  readonly numerologyStrategyId?: string;
  readonly numerologyStrategyVersion?: string;
}

export class PhaseOneCompatibilityStrategy implements CompatibilityStrategy {
  readonly id = "phase-one-comparison";
  readonly version = "1.0.0";
  private readonly numerologyStrategyId: string;
  private readonly numerologyStrategyVersion: string;

  constructor(options: PhaseOneCompatibilityStrategyOptions = {}) {
    this.numerologyStrategyId = options.numerologyStrategyId ?? "pythagorean";
    this.numerologyStrategyVersion =
      options.numerologyStrategyVersion ?? "1.0.0";
    if (
      !validVersionText(this.numerologyStrategyId) ||
      !validVersionText(this.numerologyStrategyVersion)
    )
      throw new InvalidCompatibilityInputError(
        "Compatibility numerology expectation is invalid",
      );
  }

  compare(request: PhaseOneCompatibilityRequest): PhaseOneCompatibilityResult {
    validateRequest(
      request,
      this.numerologyStrategyId,
      this.numerologyStrategyVersion,
    );
    const signs = pair(
      request.first.zodiacSign,
      request.second.zodiacSign,
      zodiacOrder,
    );
    const firstClassification = ZODIAC_CLASSIFICATIONS[signs.values[0]];
    const secondClassification = ZODIAC_CLASSIFICATIONS[signs.values[1]];
    const elements = pair(
      firstClassification.element,
      secondClassification.element,
      textOrder,
    );
    const modalities = pair(
      firstClassification.modality,
      secondClassification.modality,
      textOrder,
    );
    const lifePath = numerologyPair(
      request.first.lifePath,
      request.second.lifePath,
    );
    const expression = numerologyPair(
      request.first.expression,
      request.second.expression,
    );
    const trace: CompatibilityTraceStep[] = [
      tracePair("canonicalize-zodiac-signs", signs),
      tracePair("compare-zodiac-elements", elements),
      tracePair("compare-zodiac-modalities", modalities),
      traceNumerology("compare-life-path-values", lifePath),
      traceNumerology("compare-expression-values", expression),
    ];

    return deepFreeze({
      version: PHASE_ONE_COMPATIBILITY_RESULT_VERSION,
      strategy: { id: this.id, version: this.version },
      zodiacPolicy: ZODIAC_CLASSIFICATION_POLICY,
      numerologySource: {
        strategyId: this.numerologyStrategyId,
        strategyVersion: this.numerologyStrategyVersion,
      },
      zodiac: { signs, elements, modalities },
      numerology: { lifePath, expression },
      trace,
      disclaimer: PHASE_ONE_COMPATIBILITY_DISCLAIMER,
    });
  }
}

export function validatePhaseOneCompatibilityResult(
  result: PhaseOneCompatibilityResult,
): void {
  try {
    if (
      !result ||
      typeof result !== "object" ||
      result.version !== PHASE_ONE_COMPATIBILITY_RESULT_VERSION ||
      result.strategy.id !== "phase-one-comparison" ||
      result.strategy.version !== "1.0.0" ||
      result.zodiacPolicy.id !== ZODIAC_CLASSIFICATION_POLICY.id ||
      result.zodiacPolicy.version !== ZODIAC_CLASSIFICATION_POLICY.version ||
      !validVersionText(result.numerologySource.strategyId) ||
      !validVersionText(result.numerologySource.strategyVersion) ||
      result.disclaimer !== PHASE_ONE_COMPATIBILITY_DISCLAIMER
    )
      invalid();
    const signs = validateSignPair(result.zodiac.signs);
    const expectedElements = pair(
      ZODIAC_CLASSIFICATIONS[signs[0]].element,
      ZODIAC_CLASSIFICATIONS[signs[1]].element,
      textOrder,
    );
    const expectedModalities = pair(
      ZODIAC_CLASSIFICATIONS[signs[0]].modality,
      ZODIAC_CLASSIFICATIONS[signs[1]].modality,
      textOrder,
    );
    if (
      !sameValue(result.zodiac.elements, expectedElements) ||
      !sameValue(result.zodiac.modalities, expectedModalities)
    )
      invalid();
    validateNumerologyPairFact(result.numerology.lifePath);
    validateNumerologyPairFact(result.numerology.expression);
    const expectedTrace: readonly CompatibilityTraceStep[] = [
      tracePair("canonicalize-zodiac-signs", result.zodiac.signs),
      tracePair("compare-zodiac-elements", result.zodiac.elements),
      tracePair("compare-zodiac-modalities", result.zodiac.modalities),
      traceNumerology("compare-life-path-values", result.numerology.lifePath),
      traceNumerology(
        "compare-expression-values",
        result.numerology.expression,
      ),
    ];
    if (!sameValue(result.trace, expectedTrace)) invalid();
  } catch (error) {
    if (error instanceof InvalidCompatibilityInputError) throw error;
    invalid();
  }
}

function validateSignPair(
  fact: CompatibilityPairFact<ZodiacSign>,
): readonly [ZodiacSign, ZodiacSign] {
  if (
    !Array.isArray(fact.values) ||
    fact.values.length !== 2 ||
    !ZODIAC_SIGNS.includes(fact.values[0]) ||
    !ZODIAC_SIGNS.includes(fact.values[1])
  )
    invalid();
  const expected = pair(fact.values[0], fact.values[1], zodiacOrder);
  if (!sameValue(fact, expected)) invalid();
  return expected.values;
}

function validateNumerologyPairFact(fact: NumerologyPairFact): void {
  if (
    !Array.isArray(fact.values) ||
    fact.values.length !== 2 ||
    !SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES.includes(
      fact
        .values[0] as (typeof SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES)[number],
    ) ||
    !SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES.includes(
      fact
        .values[1] as (typeof SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES)[number],
    ) ||
    fact.values[0] > fact.values[1] ||
    fact.equal !== (fact.values[0] === fact.values[1]) ||
    fact.masterNumberCount !==
      Number([11, 22, 33].includes(fact.values[0])) +
        Number([11, 22, 33].includes(fact.values[1]))
  )
    invalid();
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function validateRequest(
  request: PhaseOneCompatibilityRequest,
  strategyId: string,
  strategyVersion: string,
): void {
  if (!request || typeof request !== "object") invalid();
  for (const subject of [request.first, request.second]) {
    if (
      !subject ||
      typeof subject !== "object" ||
      !ZODIAC_SIGNS.includes(subject.zodiacSign)
    )
      invalid();
    validateNumerologyResult(subject.lifePath, strategyId, strategyVersion);
    validateNumerologyResult(subject.expression, strategyId, strategyVersion);
  }
}

function validateNumerologyResult(
  result: NumerologyResult,
  strategyId: string,
  strategyVersion: string,
): void {
  if (
    !result ||
    typeof result !== "object" ||
    !SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES.includes(
      result.value as (typeof SUPPORTED_COMPATIBILITY_NUMEROLOGY_VALUES)[number],
    ) ||
    result.masterNumber !== [11, 22, 33].includes(result.value) ||
    result.strategyId !== strategyId ||
    result.strategyVersion !== strategyVersion ||
    !Array.isArray(result.tokens) ||
    result.tokens.length === 0 ||
    !result.tokens.every(
      (token) =>
        token &&
        validText(token.source) &&
        validText(token.normalized) &&
        Number.isSafeInteger(token.value),
    ) ||
    !Array.isArray(result.trace) ||
    result.trace.length === 0 ||
    !result.trace.every(
      (step) =>
        step &&
        validText(step.operation) &&
        Array.isArray(step.inputs) &&
        step.inputs.every(
          (input: unknown) =>
            typeof input === "string" ||
            (typeof input === "number" && Number.isFinite(input)),
        ) &&
        Number.isSafeInteger(step.result),
    ) ||
    result.trace.at(-1)?.result !== result.value
  )
    invalid();
}

function numerologyPair(
  first: NumerologyResult,
  second: NumerologyResult,
): NumerologyPairFact {
  const values = [first.value, second.value].sort((a, b) => a - b) as [
    number,
    number,
  ];
  return {
    values,
    equal: values[0] === values[1],
    masterNumberCount: (Number(first.masterNumber) +
      Number(second.masterNumber)) as 0 | 1 | 2,
  };
}

function pair<T extends string | number>(
  first: T,
  second: T,
  compare: (left: T, right: T) => number,
): CompatibilityPairFact<T> {
  const values = [first, second].sort(compare) as [T, T];
  return { values, equal: values[0] === values[1] };
}

function zodiacOrder(left: ZodiacSign, right: ZodiacSign): number {
  return ZODIAC_SIGNS.indexOf(left) - ZODIAC_SIGNS.indexOf(right);
}

function textOrder(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function tracePair<T extends string | number>(
  operation: string,
  fact: CompatibilityPairFact<T>,
): CompatibilityTraceStep {
  return {
    operation,
    inputs: fact.values,
    result: fact.equal,
  };
}

function traceNumerology(
  operation: string,
  fact: NumerologyPairFact,
): CompatibilityTraceStep {
  return {
    operation,
    inputs: [...fact.values, fact.masterNumberCount],
    result: fact.equal,
  };
}

function invalid(): never {
  throw new InvalidCompatibilityInputError(
    "Compatibility input is invalid or unsupported",
  );
}

function validText(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim() === value && value.length > 0
  );
}

function validVersionText(value: unknown): value is string {
  return validText(value) && value.length <= 100;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
