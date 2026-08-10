import type { NatalChart } from "./calculate-natal-chart";
import type { TransitSnapshot } from "./calculate-transit-snapshot";
import {
  derivePersonalLunarSnapshot,
  PERSONAL_LUNAR_SNAPSHOT_VERSION,
  type PersonalLunarSnapshot,
} from "./derive-personal-lunar-snapshot";
import { LUNAR_PHASE_ENGINE_VERSION } from "@/domain/lunar/phase";
import {
  CONTEXT_NUMEROLOGY_KEYS,
  type ContextFactReference,
  type ContextNumerologyKey,
} from "@/domain/context/contracts";
import type { NumerologyResult } from "@/domain/numerology/contracts";

export const PERSONAL_CONTEXT_FACTS_VERSION = "1.0.0";

export interface NumerologyContext {
  effectiveDate: string;
  results: Readonly<Record<ContextNumerologyKey, NumerologyResult>>;
}

export interface PersonalContextFacts {
  readonly effectiveAt: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly natal: NatalChart;
  readonly transits: TransitSnapshot;
  readonly lunar: PersonalLunarSnapshot;
  readonly numerology: NumerologyContext;
  readonly facts: readonly ContextFactReference[];
  readonly metadata: Readonly<{
    contextVersion: string;
    composedAt: string;
    numerologyStrategy: Readonly<{ id: string; version: string }>;
  }>;
}

export function composePersonalContext(
  natal: NatalChart,
  transits: TransitSnapshot,
  lunar: PersonalLunarSnapshot,
  numerology: NumerologyContext,
): PersonalContextFacts {
  validateComponentConsistency(natal, transits, lunar);
  const localDate = localDateAt(transits.input.instant, natal.input.timezone);
  if (numerology.effectiveDate !== localDate) {
    throw new RangeError(
      "Numerology effective date must match the current instant in the natal timezone",
    );
  }
  const numerologyStrategy = validateNumerology(numerology);
  const context: PersonalContextFacts = {
    effectiveAt: transits.input.instant,
    localDate,
    timezone: natal.input.timezone,
    natal,
    transits,
    lunar,
    numerology,
    facts: buildFactReferences(natal, transits, lunar),
    metadata: {
      contextVersion: PERSONAL_CONTEXT_FACTS_VERSION,
      composedAt: new Date().toISOString(),
      numerologyStrategy,
    },
  };
  return deepFreeze(structuredClone(context));
}

function validateComponentConsistency(
  natal: NatalChart,
  transits: TransitSnapshot,
  lunar: PersonalLunarSnapshot,
): void {
  if (
    !canonicalEqual(transits.natal.input, natal.input) ||
    !canonicalEqual(transits.natal.metadata, natal.metadata)
  ) {
    throw new RangeError("Transit snapshot does not reference the natal chart");
  }

  const expectedLunar = derivePersonalLunarSnapshot(transits);
  if (
    !canonicalEqual(lunar.input, expectedLunar.input) ||
    !canonicalEqual(lunar.moon, expectedLunar.moon) ||
    !canonicalEqual(lunar.phase, expectedLunar.phase) ||
    !canonicalEqual(lunar.natalAspects, expectedLunar.natalAspects) ||
    lunar.provenance.personalLunarVersion !== PERSONAL_LUNAR_SNAPSHOT_VERSION ||
    lunar.provenance.lunarPhaseEngineVersion !== LUNAR_PHASE_ENGINE_VERSION ||
    !canonicalEqual(
      lunar.provenance.currentSkyProvider,
      expectedLunar.provenance.currentSkyProvider,
    ) ||
    lunar.provenance.transitEngineVersion !==
      expectedLunar.provenance.transitEngineVersion ||
    lunar.provenance.transitCalculatedAt !==
      expectedLunar.provenance.transitCalculatedAt ||
    !canonicalEqual(
      lunar.provenance.aspectPolicy,
      expectedLunar.provenance.aspectPolicy,
    ) ||
    !canonicalEqual(lunar.provenance.natal, expectedLunar.provenance.natal)
  ) {
    throw new RangeError("Personal lunar snapshot is inconsistent");
  }
}

function validateNumerology(
  numerology: NumerologyContext,
): Readonly<{ id: string; version: string }> {
  const actualKeys = Object.keys(numerology.results).sort();
  const expectedKeys = [...CONTEXT_NUMEROLOGY_KEYS].sort();
  if (!canonicalEqual(actualKeys, expectedKeys)) {
    throw new RangeError(
      "Numerology context must contain every required result",
    );
  }

  let strategyId: string | undefined;
  let strategyVersion: string | undefined;
  for (const key of CONTEXT_NUMEROLOGY_KEYS) {
    const result = numerology.results[key];
    if (
      !Number.isSafeInteger(result.value) ||
      result.value <= 0 ||
      typeof result.masterNumber !== "boolean" ||
      result.tokens.length === 0 ||
      result.trace.length === 0 ||
      !validVersion(result.strategyId) ||
      !validVersion(result.strategyVersion)
    ) {
      throw new RangeError(`Numerology result ${key} is invalid`);
    }
    strategyId ??= result.strategyId;
    strategyVersion ??= result.strategyVersion;
    if (
      result.strategyId !== strategyId ||
      result.strategyVersion !== strategyVersion
    ) {
      throw new RangeError("Numerology results must use one strategy version");
    }
  }
  return { id: strategyId!, version: strategyVersion! };
}

function buildFactReferences(
  natal: NatalChart,
  transits: TransitSnapshot,
  lunar: PersonalLunarSnapshot,
): readonly ContextFactReference[] {
  const facts: ContextFactReference[] = [
    ...natal.placements.map((placement) => ({
      id: `natal:placement:${placement.body}`,
      kind: "natal-placement" as const,
    })),
    ...natal.aspects.map((aspect) => ({
      id: `natal:aspect:${aspect.firstBody}:${aspect.secondBody}:${aspect.type}`,
      kind: "natal-aspect" as const,
    })),
    ...transits.aspects.map((aspect) => ({
      id: `transit:${aspect.transitingBody}:${aspect.natalTarget.id}:${aspect.type}`,
      kind: "transit-aspect" as const,
    })),
    {
      id: `lunar:phase:${lunar.phase.phase}`,
      kind: "lunar-phase" as const,
    },
    ...lunar.natalAspects.map((aspect) => ({
      id: `personal-lunar:${aspect.natalTarget.id}:${aspect.type}`,
      kind: "personal-lunar-aspect" as const,
    })),
    ...CONTEXT_NUMEROLOGY_KEYS.map((key) => ({
      id: `numerology:${key}`,
      kind: "numerology" as const,
    })),
  ];
  if (new Set(facts.map((fact) => fact.id)).size !== facts.length) {
    throw new RangeError("Personal context fact identifiers must be unique");
  }
  return facts;
}

function localDateAt(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function validVersion(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 128;
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
