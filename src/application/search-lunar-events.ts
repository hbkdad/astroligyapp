import {
  type CoordinateOrigin,
  type EphemerisProvider,
  type EphemerisProviderError,
  type ObserverLocation,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { getValidatedPositions } from "@/domain/astro/provider-validation";
import {
  normalizeLongitude,
  toZodiacPosition,
  ZODIAC_SIGNS,
  type ZodiacPosition,
  type ZodiacSign,
} from "@/domain/astro/zodiac";
import { deriveLunarPhase, type LunarPhaseResult } from "@/domain/lunar/phase";

export const LUNAR_EVENT_SEARCH_VERSION = "1.0.0";
export const LUNAR_EVENT_MAX_INTERVAL_DAYS = 62;
export const LUNAR_EVENT_MAX_INITIAL_SAMPLES = 2_048;

export const PRIMARY_LUNAR_PHASES = [
  "new-moon",
  "first-quarter",
  "full-moon",
  "third-quarter",
] as const;

export type PrimaryLunarPhase = (typeof PRIMARY_LUNAR_PHASES)[number];

interface LunarSearchBase {
  startInstant: string;
  endInstant: string;
  coordinateOrigin: CoordinateOrigin;
  observer?: ObserverLocation;
  coordinateSource?: string;
  sampleStepSeconds: number;
  refinementToleranceSeconds: number;
  maxRefinementIterations: number;
}

export type LunarEventSearchInput =
  | (LunarSearchBase &
      Readonly<{
        eventType: "moon-sign-ingress";
        enteredSign: ZodiacSign;
      }>)
  | (LunarSearchBase &
      Readonly<{
        eventType: "primary-phase";
        phase: PrimaryLunarPhase;
      }>);

export interface LunarEventPoint {
  instant: string;
  moonLongitudeDegrees: number;
  sunLongitudeDegrees?: number;
  angularErrorDegrees: number;
}

export type LunarEvent =
  | Readonly<{
      id: string;
      type: "moon-sign-ingress";
      previousSign: ZodiacSign;
      enteredSign: ZodiacSign;
      boundaryLongitudeDegrees: number;
      point: LunarEventPoint;
      moonZodiac: ZodiacPosition;
    }>
  | Readonly<{
      id: string;
      type: "primary-phase";
      phase: PrimaryLunarPhase;
      phaseAnchorDegrees: number;
      point: LunarEventPoint;
      geometry: LunarPhaseResult;
    }>;

export interface LunarEventSearchOutput {
  input: LunarEventSearchInput;
  event: LunarEvent;
  metadata: Readonly<{
    searchEngineVersion: string;
    calculatedAt: string;
    provider: ProviderMetadata;
    searchPolicy: Readonly<{
      sampleStepSeconds: number;
      refinementToleranceSeconds: number;
      maxRefinementIterations: number;
      initialSampleCount: number;
      evaluationCount: number;
    }>;
    evaluations: readonly Readonly<{
      instant: string;
      moonLongitudeDegrees: number;
      sunLongitudeDegrees?: number;
      providerCalculatedAt: string;
    }>[];
  }>;
}

export type LunarEventSearchErrorCode =
  | EphemerisProviderError["code"]
  | "event-not-bracketed"
  | "ambiguous-event"
  | "insufficient-precision"
  | "inconsistent-provider-trace";

export interface LunarEventSearchError {
  code: LunarEventSearchErrorCode;
  message: string;
  retryable: boolean;
}

export type LunarEventSearchResult =
  | Readonly<{ ok: true; value: LunarEventSearchOutput }>
  | Readonly<{ ok: false; error: LunarEventSearchError }>;

interface Evaluation {
  epochMilliseconds: number;
  instant: string;
  moonLongitudeDegrees: number;
  sunLongitudeDegrees?: number;
  eventAngleDegrees: number;
  signedErrorDegrees: number;
  metadata: ProviderMetadata;
}

type EvaluationResult =
  | Readonly<{ ok: true; value: Evaluation }>
  | Readonly<{ ok: false; error: LunarEventSearchError }>;

type Root =
  | Readonly<{ exact: Evaluation }>
  | Readonly<{ left: Evaluation; right: Evaluation }>;

const PHASE_ANCHORS: Readonly<Record<PrimaryLunarPhase, number>> = {
  "new-moon": 0,
  "first-quarter": 90,
  "full-moon": 180,
  "third-quarter": 270,
};

export class LunarEventSearch {
  constructor(
    private readonly provider: EphemerisProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async search(input: LunarEventSearchInput): Promise<LunarEventSearchResult> {
    const validated = validateInput(input);
    const targetAngleDegrees =
      input.eventType === "primary-phase"
        ? PHASE_ANCHORS[input.phase]
        : ZODIAC_SIGNS.indexOf(input.enteredSign) * 30;
    const requestedBodies =
      input.eventType === "primary-phase"
        ? (["sun", "moon"] as const)
        : (["moon"] as const);
    const cache = new Map<number, Evaluation>();
    let providerTrace: ProviderMetadata | undefined;

    const evaluate = async (
      epochMilliseconds: number,
    ): Promise<EvaluationResult> => {
      const cached = cache.get(epochMilliseconds);
      if (cached) return { ok: true, value: cached };
      const instant = new Date(epochMilliseconds).toISOString();
      const result = await getValidatedPositions(this.provider, {
        instant,
        bodies: requestedBodies,
        ...(input.observer ? { observer: input.observer } : {}),
        zodiacReference: "tropical",
        coordinateOrigin: input.coordinateOrigin,
      });
      if (!result.ok) return result;
      if (
        providerTrace &&
        !sameProviderTrace(providerTrace, result.value.metadata)
      ) {
        return failure(
          "inconsistent-provider-trace",
          "Ephemeris provider trace changed during lunar event search",
        );
      }
      providerTrace ??= result.value.metadata;
      const positions = new Map(
        result.value.positions.map((position) => [position.body, position]),
      );
      const moonLongitudeDegrees =
        positions.get("moon")!.eclipticLongitudeDegrees;
      const sunLongitudeDegrees =
        positions.get("sun")?.eclipticLongitudeDegrees;
      const eventAngleDegrees =
        input.eventType === "primary-phase"
          ? normalizeLongitude(moonLongitudeDegrees - sunLongitudeDegrees!)
          : moonLongitudeDegrees;
      const evaluation: Evaluation = {
        epochMilliseconds,
        instant,
        moonLongitudeDegrees,
        ...(sunLongitudeDegrees === undefined ? {} : { sunLongitudeDegrees }),
        eventAngleDegrees,
        signedErrorDegrees: signedError(eventAngleDegrees, targetAngleDegrees),
        metadata: result.value.metadata,
      };
      cache.set(epochMilliseconds, evaluation);
      return { ok: true, value: evaluation };
    };

    const initialInstants = buildInitialInstants(
      validated.startMilliseconds,
      validated.endMilliseconds,
      input.sampleStepSeconds * 1_000,
    );
    const samples: Evaluation[] = [];
    for (const instant of initialInstants) {
      const result = await evaluate(instant);
      if (!result.ok) return result;
      samples.push(result.value);
    }
    const roots = findIncreasingRoots(samples, input);
    if (roots.length > 1) {
      return failure(
        "ambiguous-event",
        "Search interval contains more than one matching lunar event",
      );
    }
    const root = roots[0];
    if (!root) {
      return failure(
        "event-not-bracketed",
        "Search interval does not bracket the requested lunar event",
      );
    }
    const refined =
      "exact" in root
        ? ({ ok: true, value: root.exact } as const)
        : await refineIncreasingRoot(
            root.left,
            root.right,
            input.refinementToleranceSeconds * 1_000,
            input.maxRefinementIterations,
            evaluate,
          );
    if (!refined.ok) return refined;

    const point = toPoint(refined.value);
    const event: LunarEvent =
      input.eventType === "primary-phase"
        ? {
            id: `lunar:phase:${input.phase}:${refined.value.instant}`,
            type: "primary-phase",
            phase: input.phase,
            phaseAnchorDegrees: targetAngleDegrees,
            point,
            geometry: deriveLunarPhase(
              refined.value.sunLongitudeDegrees!,
              refined.value.moonLongitudeDegrees,
            ),
          }
        : {
            id: `lunar:ingress:${input.enteredSign}:${refined.value.instant}`,
            type: "moon-sign-ingress",
            previousSign:
              ZODIAC_SIGNS[
                (ZODIAC_SIGNS.indexOf(input.enteredSign) + 11) % 12
              ]!,
            enteredSign: input.enteredSign,
            boundaryLongitudeDegrees: targetAngleDegrees,
            point,
            moonZodiac: toZodiacPosition(refined.value.moonLongitudeDegrees),
          };
    const evaluations = [...cache.values()]
      .sort((left, right) => left.epochMilliseconds - right.epochMilliseconds)
      .map((evaluation) => ({
        instant: evaluation.instant,
        moonLongitudeDegrees: evaluation.moonLongitudeDegrees,
        ...(evaluation.sunLongitudeDegrees === undefined
          ? {}
          : { sunLongitudeDegrees: evaluation.sunLongitudeDegrees }),
        providerCalculatedAt: evaluation.metadata.calculatedAt,
      }));
    return {
      ok: true,
      value: deepFreeze({
        input: structuredClone(input),
        event,
        metadata: {
          searchEngineVersion: LUNAR_EVENT_SEARCH_VERSION,
          calculatedAt: this.now().toISOString(),
          provider: { ...providerTrace! },
          searchPolicy: {
            sampleStepSeconds: input.sampleStepSeconds,
            refinementToleranceSeconds: input.refinementToleranceSeconds,
            maxRefinementIterations: input.maxRefinementIterations,
            initialSampleCount: initialInstants.length,
            evaluationCount: cache.size,
          },
          evaluations,
        },
      }),
    };
  }
}

function validateInput(input: LunarEventSearchInput): Readonly<{
  startMilliseconds: number;
  endMilliseconds: number;
}> {
  const startMilliseconds = parseUtcInstant(input.startInstant);
  const endMilliseconds = parseUtcInstant(input.endInstant);
  const durationMilliseconds = endMilliseconds - startMilliseconds;
  if (
    durationMilliseconds <= 0 ||
    durationMilliseconds > LUNAR_EVENT_MAX_INTERVAL_DAYS * 86_400_000
  )
    throw new RangeError("Lunar search interval is invalid or too large");
  if (
    !Number.isInteger(input.sampleStepSeconds) ||
    input.sampleStepSeconds < 60 ||
    input.sampleStepSeconds > 86_400 ||
    input.sampleStepSeconds * 1_000 >= durationMilliseconds ||
    Math.ceil(durationMilliseconds / (input.sampleStepSeconds * 1_000)) + 1 >
      LUNAR_EVENT_MAX_INITIAL_SAMPLES
  )
    throw new RangeError("Lunar search sample step is invalid");
  if (
    !Number.isInteger(input.refinementToleranceSeconds) ||
    input.refinementToleranceSeconds < 1 ||
    input.refinementToleranceSeconds >= input.sampleStepSeconds
  )
    throw new RangeError("Lunar search refinement tolerance is invalid");
  if (
    !Number.isInteger(input.maxRefinementIterations) ||
    input.maxRefinementIterations < 1 ||
    input.maxRefinementIterations > 100
  )
    throw new RangeError("Lunar search refinement limit is invalid");
  if (
    input.eventType === "primary-phase" &&
    !PRIMARY_LUNAR_PHASES.includes(input.phase)
  )
    throw new RangeError("Unsupported primary lunar phase");
  if (
    input.eventType === "moon-sign-ingress" &&
    !ZODIAC_SIGNS.includes(input.enteredSign)
  )
    throw new RangeError("Unsupported lunar ingress sign");
  validateCoordinateProvenance(input);
  return { startMilliseconds, endMilliseconds };
}

function validateCoordinateProvenance(input: LunarSearchBase): void {
  if (
    input.coordinateOrigin === "topocentric" &&
    (!input.observer || !validSource(input.coordinateSource))
  )
    throw new RangeError(
      "Topocentric lunar searches require observer provenance",
    );
  if (
    input.coordinateOrigin === "geocentric" &&
    (input.observer !== undefined || input.coordinateSource !== undefined)
  )
    throw new RangeError(
      "Geocentric lunar searches must omit observer provenance",
    );
}

function findIncreasingRoots(
  samples: readonly Evaluation[],
  input: LunarEventSearchInput,
): readonly Root[] {
  const roots: Root[] = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    const left = samples[index]!;
    const right = samples[index + 1]!;
    if (
      left.signedErrorDegrees < 0 &&
      right.signedErrorDegrees > 0 &&
      right.signedErrorDegrees - left.signedErrorDegrees <
        (input.eventType === "primary-phase" ? 90 : 180) &&
      hasExpectedIngressSides(left, right, input)
    )
      addRoot(roots, { left, right });
  }
  for (let index = 1; index < samples.length - 1; index += 1) {
    if (
      samples[index]!.signedErrorDegrees === 0 &&
      samples[index - 1]!.signedErrorDegrees < 0 &&
      samples[index + 1]!.signedErrorDegrees > 0 &&
      hasExpectedIngressSides(samples[index - 1]!, samples[index + 1]!, input)
    )
      addRoot(roots, { exact: samples[index]! });
  }
  return roots;
}

function hasExpectedIngressSides(
  left: Evaluation,
  right: Evaluation,
  input: LunarEventSearchInput,
): boolean {
  if (input.eventType === "primary-phase") return true;
  const enteredIndex = ZODIAC_SIGNS.indexOf(input.enteredSign);
  return (
    toZodiacPosition(left.moonLongitudeDegrees).sign ===
      ZODIAC_SIGNS[(enteredIndex + 11) % 12] &&
    toZodiacPosition(right.moonLongitudeDegrees).sign === input.enteredSign
  );
}

function addRoot(roots: Root[], candidate: Root): void {
  const candidateTime =
    "exact" in candidate
      ? candidate.exact.epochMilliseconds
      : candidate.left.epochMilliseconds;
  if (
    roots.some((root) =>
      "exact" in root
        ? root.exact.epochMilliseconds === candidateTime
        : root.left.epochMilliseconds === candidateTime,
    )
  )
    return;
  roots.push(candidate);
}

async function refineIncreasingRoot(
  initialLeft: Evaluation,
  initialRight: Evaluation,
  toleranceMilliseconds: number,
  maxIterations: number,
  evaluate: (epochMilliseconds: number) => Promise<EvaluationResult>,
): Promise<EvaluationResult> {
  let left = initialLeft;
  let right = initialRight;
  let iterations = 0;
  while (
    right.epochMilliseconds - left.epochMilliseconds > toleranceMilliseconds &&
    iterations < maxIterations
  ) {
    const midpoint = Math.floor(
      (left.epochMilliseconds + right.epochMilliseconds) / 2,
    );
    if (
      midpoint === left.epochMilliseconds ||
      midpoint === right.epochMilliseconds
    )
      break;
    const result = await evaluate(midpoint);
    if (!result.ok) return result;
    if (result.value.signedErrorDegrees === 0) return result;
    if (result.value.signedErrorDegrees < 0) left = result.value;
    else right = result.value;
    iterations += 1;
  }
  if (right.epochMilliseconds - left.epochMilliseconds > toleranceMilliseconds)
    return failure(
      "insufficient-precision",
      "Refinement limit was reached before the declared time tolerance",
    );
  return { ok: true, value: right };
}

function buildInitialInstants(
  startMilliseconds: number,
  endMilliseconds: number,
  stepMilliseconds: number,
): readonly number[] {
  const values: number[] = [];
  for (
    let instant = startMilliseconds;
    instant < endMilliseconds;
    instant += stepMilliseconds
  )
    values.push(instant);
  values.push(endMilliseconds);
  return values;
}

function signedError(value: number, target: number): number {
  const difference = normalizeLongitude(value - target);
  return difference > 180 ? difference - 360 : difference;
}

function toPoint(evaluation: Evaluation): LunarEventPoint {
  return {
    instant: evaluation.instant,
    moonLongitudeDegrees: evaluation.moonLongitudeDegrees,
    ...(evaluation.sunLongitudeDegrees === undefined
      ? {}
      : { sunLongitudeDegrees: evaluation.sunLongitudeDegrees }),
    angularErrorDegrees: Math.abs(evaluation.signedErrorDegrees),
  };
}

function sameProviderTrace(
  first: ProviderMetadata,
  second: ProviderMetadata,
): boolean {
  return (
    first.providerId === second.providerId &&
    first.providerVersion === second.providerVersion &&
    first.dataVersion === second.dataVersion &&
    first.timeScale === second.timeScale &&
    first.referenceFrame === second.referenceFrame &&
    first.zodiacReference === second.zodiacReference &&
    first.coordinateOrigin === second.coordinateOrigin
  );
}

function parseUtcInstant(value: string): number {
  const match =
    typeof value === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(
          value,
        )
      : null;
  if (!match) throw new RangeError("Lunar search requires UTC instants");
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const epochMilliseconds = Date.parse(value);
  const parsed = new Date(epochMilliseconds);
  if (
    !Number.isFinite(epochMilliseconds) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  )
    throw new RangeError("Lunar search requires valid UTC instants");
  return epochMilliseconds;
}

function validSource(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    Boolean(value.trim()) &&
    value.length <= 128 &&
    !/[\r\n]/.test(value)
  );
}

function failure(
  code: LunarEventSearchErrorCode,
  message: string,
): Readonly<{ ok: false; error: LunarEventSearchError }> {
  return { ok: false, error: { code, message, retryable: false } };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
