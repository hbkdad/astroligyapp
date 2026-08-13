import type {
  EphemerisProvider,
  EphemerisProviderError,
  ProviderMetadata,
} from "@/domain/astro/contracts";
import { getValidatedPositions } from "@/domain/astro/provider-validation";
import {
  normalizeLongitude,
  toZodiacPosition,
  ZODIAC_SIGNS,
  type ZodiacSign,
} from "@/domain/astro/zodiac";
import {
  deriveLunarPhase,
  LUNAR_PHASE_ENGINE_VERSION,
  type LunarPhaseResult,
} from "@/domain/lunar/phase";
import { MemoizedEphemerisProvider } from "@/infrastructure/ephemeris/memoized-ephemeris-provider";
import {
  LUNAR_EVENT_SEARCH_VERSION,
  LunarEventSearch,
  PRIMARY_LUNAR_PHASES,
  type LunarEventSearchOutput,
  type LunarEventSearchError,
  type PrimaryLunarPhase,
} from "./search-lunar-events";

export const PUBLIC_LUNAR_CALENDAR_VERSION = "1.0.0";
export const PUBLIC_LUNAR_CALENDAR_DAYS = 7;
export const PUBLIC_LUNAR_SAMPLE_STEP_SECONDS = 43_200;
export const PUBLIC_LUNAR_REFINEMENT_TOLERANCE_SECONDS = 60;
export const PUBLIC_LUNAR_MAX_REFINEMENT_ITERATIONS = 24;

export interface PublicLunarCalendar {
  readonly version: typeof PUBLIC_LUNAR_CALENDAR_VERSION;
  readonly date: string;
  readonly timezone: "UTC";
  readonly effectiveAt: string;
  readonly interval: Readonly<{ startInstant: string; endInstant: string }>;
  readonly current: Readonly<{
    sunLongitudeDegrees: number;
    moonLongitudeDegrees: number;
    moonZodiac: ReturnType<typeof toZodiacPosition>;
    phase: LunarPhaseResult;
  }>;
  readonly events: readonly LunarEventSearchOutput[];
  readonly metadata: Readonly<{
    calculatedAt: string;
    provider: ProviderMetadata;
    lunarPhaseEngineVersion: typeof LUNAR_PHASE_ENGINE_VERSION;
    lunarEventSearchVersion: typeof LUNAR_EVENT_SEARCH_VERSION;
    sampleStepSeconds: typeof PUBLIC_LUNAR_SAMPLE_STEP_SECONDS;
    refinementToleranceSeconds: typeof PUBLIC_LUNAR_REFINEMENT_TOLERANCE_SECONDS;
    maxRefinementIterations: typeof PUBLIC_LUNAR_MAX_REFINEMENT_ITERATIONS;
    providerPositionCallCount: number;
  }>;
}

export type PublicLunarCalendarResult =
  | Readonly<{ ok: true; value: PublicLunarCalendar }>
  | Readonly<{
      ok: false;
      error: EphemerisProviderError | LunarEventSearchError;
    }>;

interface Observation {
  readonly epoch: number;
  readonly instant: string;
  readonly sun: number;
  readonly moon: number;
  readonly metadata: ProviderMetadata;
}

export class PublicLunarCalendarEngine {
  constructor(
    private readonly provider: EphemerisProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async calculate(date: string): Promise<PublicLunarCalendarResult> {
    let dayStart: number;
    try {
      dayStart = plainDateEpoch(date);
    } catch {
      return failure("invalid-request", "Public lunar date is invalid");
    }
    const intervalEnd = dayStart + PUBLIC_LUNAR_CALENDAR_DAYS * 86_400_000;
    const observationStart = dayStart - 86_400_000;
    const observationEnd = intervalEnd + 86_400_000;
    const provider = new MemoizedEphemerisProvider(this.provider);
    const observations: Observation[] = [];
    let trace: ProviderMetadata | undefined;
    for (
      let epoch = observationStart;
      epoch <= observationEnd;
      epoch += PUBLIC_LUNAR_SAMPLE_STEP_SECONDS * 1_000
    ) {
      const instant = new Date(epoch).toISOString();
      const result = await getValidatedPositions(provider, {
        instant,
        bodies: ["sun", "moon"],
        zodiacReference: "tropical",
        coordinateOrigin: "geocentric",
      });
      if (!result.ok) return result;
      if (trace && !sameTrace(trace, result.value.metadata))
        return failure(
          "invalid-provider-response",
          "Provider trace changed during public lunar calculation",
        );
      trace ??= result.value.metadata;
      observations.push({
        epoch,
        instant,
        sun: result.value.positions.find(({ body }) => body === "sun")!
          .eclipticLongitudeDegrees,
        moon: result.value.positions.find(({ body }) => body === "moon")!
          .eclipticLongitudeDegrees,
        metadata: result.value.metadata,
      });
    }
    const current = observations.find(
      ({ epoch }) => epoch === dayStart + 43_200_000,
    )!;
    const events: LunarEventSearchOutput[] = [];
    for (const candidate of crossings(observations)) {
      if (candidate.index < 1 || candidate.index + 2 >= observations.length)
        continue;
      const result = await new LunarEventSearch(provider).search({
        startInstant: observations[candidate.index - 1]!.instant,
        endInstant: observations[candidate.index + 2]!.instant,
        coordinateOrigin: "geocentric",
        ...(candidate.kind === "phase"
          ? { eventType: "primary-phase" as const, phase: candidate.target }
          : {
              eventType: "moon-sign-ingress" as const,
              enteredSign: candidate.target,
            }),
        sampleStepSeconds: PUBLIC_LUNAR_SAMPLE_STEP_SECONDS,
        refinementToleranceSeconds: PUBLIC_LUNAR_REFINEMENT_TOLERANCE_SECONDS,
        maxRefinementIterations: PUBLIC_LUNAR_MAX_REFINEMENT_ITERATIONS,
      });
      if (!result.ok) return { ok: false, error: result.error };
      const eventEpoch = Date.parse(result.value.event.point.instant);
      if (eventEpoch >= dayStart && eventEpoch < intervalEnd)
        events.push(result.value);
    }
    events.sort(
      (left, right) =>
        left.event.point.instant.localeCompare(right.event.point.instant) ||
        left.event.id.localeCompare(right.event.id),
    );
    const calculatedAt = this.now();
    if (
      !(calculatedAt instanceof Date) ||
      !Number.isFinite(calculatedAt.getTime())
    )
      return failure(
        "invalid-request",
        "Public lunar calculation clock is invalid",
      );
    return {
      ok: true,
      value: deepFreeze({
        version: PUBLIC_LUNAR_CALENDAR_VERSION,
        date,
        timezone: "UTC" as const,
        effectiveAt: current.instant,
        interval: {
          startInstant: new Date(dayStart).toISOString(),
          endInstant: new Date(intervalEnd).toISOString(),
        },
        current: {
          sunLongitudeDegrees: current.sun,
          moonLongitudeDegrees: current.moon,
          moonZodiac: toZodiacPosition(current.moon),
          phase: deriveLunarPhase(current.sun, current.moon),
        },
        events,
        metadata: {
          calculatedAt: calculatedAt.toISOString(),
          provider: current.metadata,
          lunarPhaseEngineVersion: LUNAR_PHASE_ENGINE_VERSION,
          lunarEventSearchVersion: LUNAR_EVENT_SEARCH_VERSION,
          sampleStepSeconds: PUBLIC_LUNAR_SAMPLE_STEP_SECONDS,
          refinementToleranceSeconds: PUBLIC_LUNAR_REFINEMENT_TOLERANCE_SECONDS,
          maxRefinementIterations: PUBLIC_LUNAR_MAX_REFINEMENT_ITERATIONS,
          providerPositionCallCount: provider.providerPositionCallCount,
        },
      }),
    };
  }
}

function crossings(values: readonly Observation[]) {
  const result: Array<
    | { kind: "phase"; target: PrimaryLunarPhase; index: number }
    | { kind: "sign"; target: ZodiacSign; index: number }
  > = [];
  for (let index = 0; index < values.length - 1; index += 1) {
    const left = values[index]!;
    const right = values[index + 1]!;
    const leftPhase = normalizeLongitude(left.moon - left.sun);
    const rightPhase = normalizeLongitude(right.moon - right.sun);
    PRIMARY_LUNAR_PHASES.forEach((target, targetIndex) => {
      if (crossesIncreasing(leftPhase, rightPhase, targetIndex * 90))
        result.push({ kind: "phase", target, index });
    });
    ZODIAC_SIGNS.forEach((target, targetIndex) => {
      if (crossesIncreasing(left.moon, right.moon, targetIndex * 30))
        result.push({ kind: "sign", target, index });
    });
  }
  return result;
}

function crossesIncreasing(left: number, right: number, target: number) {
  const travel = normalizeLongitude(right - left);
  const distance = normalizeLongitude(target - left);
  return travel > 0 && travel < 180 && distance > 0 && distance <= travel;
}

export function plainDateEpoch(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Public lunar date is invalid");
  const epoch = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (new Date(epoch).toISOString().slice(0, 10) !== value)
    throw new RangeError("Public lunar date is invalid");
  return epoch;
}

function sameTrace(left: ProviderMetadata, right: ProviderMetadata) {
  return (
    left.providerId === right.providerId &&
    left.providerVersion === right.providerVersion &&
    left.dataVersion === right.dataVersion &&
    left.timeScale === right.timeScale &&
    left.referenceFrame === right.referenceFrame &&
    left.zodiacReference === right.zodiacReference &&
    left.coordinateOrigin === right.coordinateOrigin
  );
}

function failure(
  code: EphemerisProviderError["code"],
  message: string,
): Extract<PublicLunarCalendarResult, { ok: false }> {
  return { ok: false, error: { code, message, retryable: false } };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
