import type { ZodiacSign } from "@/domain/astro/zodiac";
import type { NumerologyResult } from "@/domain/numerology/contracts";

export type ZodiacElement = "fire" | "earth" | "air" | "water";
export type ZodiacModality = "cardinal" | "fixed" | "mutable";

export interface CompatibilitySubjectFacts {
  readonly zodiacSign: ZodiacSign;
  readonly lifePath: NumerologyResult;
  readonly expression: NumerologyResult;
}

export interface PhaseOneCompatibilityRequest {
  readonly first: CompatibilitySubjectFacts;
  readonly second: CompatibilitySubjectFacts;
}

export interface CompatibilityPairFact<T extends string | number> {
  readonly values: readonly [T, T];
  readonly equal: boolean;
}

export interface NumerologyPairFact extends CompatibilityPairFact<number> {
  readonly masterNumberCount: 0 | 1 | 2;
}

export interface PhaseOneCompatibilityResult {
  readonly version: string;
  readonly strategy: Readonly<{ id: string; version: string }>;
  readonly zodiacPolicy: Readonly<{ id: string; version: string }>;
  readonly numerologySource: Readonly<{
    strategyId: string;
    strategyVersion: string;
  }>;
  readonly zodiac: Readonly<{
    signs: CompatibilityPairFact<ZodiacSign>;
    elements: CompatibilityPairFact<ZodiacElement>;
    modalities: CompatibilityPairFact<ZodiacModality>;
  }>;
  readonly numerology: Readonly<{
    lifePath: NumerologyPairFact;
    expression: NumerologyPairFact;
  }>;
  readonly trace: readonly CompatibilityTraceStep[];
  readonly disclaimer: string;
}

export interface CompatibilityTraceStep {
  readonly operation: string;
  readonly inputs: readonly (string | number | boolean)[];
  readonly result: string | number | boolean;
}

export interface CompatibilityStrategy {
  readonly id: string;
  readonly version: string;
  compare(request: PhaseOneCompatibilityRequest): PhaseOneCompatibilityResult;
}
