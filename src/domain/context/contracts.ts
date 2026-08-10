import type { PositionResult } from "@/domain/astro/contracts";
import type { NumerologyResult } from "@/domain/numerology/contracts";

export interface CalculationVersions {
  astroEngine: string;
  lunarEngine: string;
  numerologyEngine: string;
  interpretationLibrary: string;
  scoreModel: string;
}

export interface ContextSignal {
  id: string;
  category: string;
  strength: number;
  explanationKey: string;
  sourceIds: readonly string[];
}

export interface PersonalContext {
  effectiveAt: string;
  timezone: string;
  sky: PositionResult;
  numerology: Readonly<Record<string, NumerologyResult>>;
  signals: readonly ContextSignal[];
  versions: CalculationVersions;
}
