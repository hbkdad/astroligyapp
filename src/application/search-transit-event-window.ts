import {
  ASPECT_TYPES,
  DEFAULT_ASPECT_DEFINITIONS,
  MAJOR_ASPECT_POLICY_ID,
  MAJOR_ASPECT_POLICY_VERSION,
  minimalAngularSeparation,
  validateAspectDefinitions,
  type AspectDefinition,
  type AspectType,
} from "@/domain/astro/aspects";
import {
  CELESTIAL_BODIES,
  type CelestialBody,
  type CoordinateOrigin,
  type EphemerisProvider,
  type EphemerisProviderError,
  type ObserverLocation,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { getValidatedPositions } from "@/domain/astro/provider-validation";
import { normalizeLongitude } from "@/domain/astro/zodiac";
import type { NatalChart } from "./calculate-natal-chart";
import {
  buildNatalTransitTargets,
  validateNatalTransitTargets,
  validateTransitInputProvenance,
  type NatalTransitTarget,
} from "./calculate-transit-snapshot";

export const TRANSIT_EVENT_SEARCH_VERSION = "1.0.0";
export const TRANSIT_EVENT_MAX_INTERVAL_DAYS = 366;
export const TRANSIT_EVENT_MAX_INITIAL_SAMPLES = 2_048;

export interface TransitEventSearchInput {
  startInstant: string;
  endInstant: string;
  transitingBody: CelestialBody;
  natalTargetId: NatalTransitTarget["id"];
  aspectType: AspectType;
  coordinateOrigin: CoordinateOrigin;
  observer?: ObserverLocation;
  coordinateSource?: string;
  sampleStepSeconds: number;
  refinementToleranceSeconds: number;
  maxRefinementIterations: number;
}

export interface TransitEventPoint {
  instant: string;
  transitingLongitudeDegrees: number;
  actualAngleDegrees: number;
  orbDegrees: number;
  normalizedStrength: number;
}

export interface TransitEventWindow {
  input: TransitEventSearchInput;
  event: Readonly<{
    id: string;
    transitingBody: CelestialBody;
    natalTarget: NatalTransitTarget;
    aspect: AspectDefinition;
    start: TransitEventPoint;
    peak: TransitEventPoint;
    end: TransitEventPoint;
  }>;
  metadata: Readonly<{
    searchEngineVersion: string;
    calculatedAt: string;
    provider: ProviderMetadata;
    natal: Readonly<{
      input: NatalChart["input"];
      metadata: NatalChart["metadata"];
    }>;
    aspectPolicy: Readonly<{
      id: string;
      version: string;
      definitions: readonly AspectDefinition[];
    }>;
    searchPolicy: Readonly<{
      sampleStepSeconds: number;
      refinementToleranceSeconds: number;
      maxRefinementIterations: number;
      initialSampleCount: number;
      evaluationCount: number;
    }>;
    evaluations: readonly Readonly<{
      instant: string;
      transitingLongitudeDegrees: number;
      providerCalculatedAt: string;
    }>[];
  }>;
}

export type TransitEventSearchErrorCode =
  | EphemerisProviderError["code"]
  | "event-not-bracketed"
  | "ambiguous-event"
  | "insufficient-precision"
  | "inconsistent-provider-trace";

export interface TransitEventSearchError {
  code: TransitEventSearchErrorCode;
  message: string;
  retryable: boolean;
}

export type TransitEventSearchResult =
  | Readonly<{ ok: true; value: TransitEventWindow }>
  | Readonly<{ ok: false; error: TransitEventSearchError }>;

interface Evaluation {
  epochMilliseconds: number;
  instant: string;
  transitingLongitudeDegrees: number;
  relativeLongitudeDegrees: number;
  actualAngleDegrees: number;
  orbDegrees: number;
  normalizedStrength: number;
  active: boolean;
  metadata: ProviderMetadata;
}

type EvaluationResult =
  | Readonly<{ ok: true; value: Evaluation }>
  | Readonly<{ ok: false; error: TransitEventSearchError }>;

interface RootBracket {
  branchAngleDegrees: number;
  exact?: Evaluation;
  left?: Evaluation;
  right?: Evaluation;
}

export class TransitEventWindowSearch {
  constructor(
    private readonly provider: EphemerisProvider,
    private readonly aspectDefinitions: readonly AspectDefinition[] = DEFAULT_ASPECT_DEFINITIONS,
  ) {
    validateAspectDefinitions(aspectDefinitions);
  }

  async search(
    natalChart: NatalChart,
    input: TransitEventSearchInput,
  ): Promise<TransitEventSearchResult> {
    validateNatalTransitTargets(natalChart);
    const validated = validateSearchInput(input, this.aspectDefinitions);
    validateTransitInputProvenance({
      instant: input.startInstant,
      coordinateOrigin: input.coordinateOrigin,
      ...(input.observer ? { observer: input.observer } : {}),
      ...(input.coordinateSource
        ? { coordinateSource: input.coordinateSource }
        : {}),
    });
    const natalTarget = buildNatalTransitTargets(natalChart).find(
      (target) => target.id === input.natalTargetId,
    );
    if (!natalTarget) throw new RangeError("Unknown natal transit target");

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
        bodies: [input.transitingBody],
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
          "Ephemeris provider trace changed during event search",
        );
      }
      providerTrace ??= result.value.metadata;
      const position = result.value.positions[0]!;
      const relativeLongitudeDegrees = normalizeLongitude(
        position.eclipticLongitudeDegrees - natalTarget.longitudeDegrees,
      );
      const actualAngleDegrees = minimalAngularSeparation(
        position.eclipticLongitudeDegrees,
        natalTarget.longitudeDegrees,
      );
      const orbDegrees = Math.abs(
        actualAngleDegrees - validated.aspect.exactAngleDegrees,
      );
      const evaluation: Evaluation = {
        epochMilliseconds,
        instant,
        transitingLongitudeDegrees: position.eclipticLongitudeDegrees,
        relativeLongitudeDegrees,
        actualAngleDegrees,
        orbDegrees,
        normalizedStrength:
          validated.aspect.maximumOrbDegrees === 0
            ? Number(orbDegrees === 0)
            : Math.max(0, 1 - orbDegrees / validated.aspect.maximumOrbDegrees),
        active: orbDegrees <= validated.aspect.maximumOrbDegrees,
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

    const activeRuns = findActiveRuns(samples);
    if (activeRuns.length > 1) {
      return failure(
        "ambiguous-event",
        "Search interval contains more than one active event window",
      );
    }
    const run = activeRuns[0];
    if (!run || run.startIndex === 0 || run.endIndex === samples.length - 1) {
      return failure(
        "event-not-bracketed",
        "Search interval must bracket one complete inactive-active-inactive event",
      );
    }

    const rootBrackets = findExactRootBrackets(
      samples,
      run.startIndex,
      run.endIndex,
      validated.aspect,
    );
    if (rootBrackets.length > 1) {
      return failure(
        "ambiguous-event",
        "Active event window contains more than one exact aspect peak",
      );
    }
    const rootBracket = rootBrackets[0];
    if (!rootBracket) {
      return failure(
        "event-not-bracketed",
        "Active event window does not bracket an exact aspect peak",
      );
    }

    const toleranceMilliseconds = input.refinementToleranceSeconds * 1_000;
    const start = await refineScalarCrossing(
      samples[run.startIndex - 1]!,
      samples[run.startIndex]!,
      (value) => value.orbDegrees - validated.aspect.maximumOrbDegrees,
      toleranceMilliseconds,
      input.maxRefinementIterations,
      evaluate,
    );
    if (!start.ok) return start;
    const peak = rootBracket.exact
      ? ({ ok: true, value: rootBracket.exact } as const)
      : await refineScalarCrossing(
          rootBracket.left!,
          rootBracket.right!,
          (value) =>
            signedBranchError(
              value.relativeLongitudeDegrees,
              rootBracket.branchAngleDegrees,
            ),
          toleranceMilliseconds,
          input.maxRefinementIterations,
          evaluate,
        );
    if (!peak.ok) return peak;
    const end = await refineScalarCrossing(
      samples[run.endIndex]!,
      samples[run.endIndex + 1]!,
      (value) => value.orbDegrees - validated.aspect.maximumOrbDegrees,
      toleranceMilliseconds,
      input.maxRefinementIterations,
      evaluate,
    );
    if (!end.ok) return end;
    if (!(
      start.value.epochMilliseconds < peak.value.epochMilliseconds &&
      peak.value.epochMilliseconds < end.value.epochMilliseconds
    )) {
      return failure(
        "insufficient-precision",
        "Refined event boundaries are not strictly ordered",
      );
    }

    const evaluations = [...cache.values()]
      .sort((left, right) => left.epochMilliseconds - right.epochMilliseconds)
      .map((evaluation) => ({
        instant: evaluation.instant,
        transitingLongitudeDegrees: evaluation.transitingLongitudeDegrees,
        providerCalculatedAt: evaluation.metadata.calculatedAt,
      }));
    return {
      ok: true,
      value: deepFreeze({
        input: structuredClone(input),
        event: {
          id: `transit:${input.transitingBody}:${natalTarget.id}:${input.aspectType}`,
          transitingBody: input.transitingBody,
          natalTarget: structuredClone(natalTarget),
          aspect: { ...validated.aspect },
          start: toEventPoint(start.value),
          peak: toEventPoint(peak.value),
          end: toEventPoint(end.value),
        },
        metadata: {
          searchEngineVersion: TRANSIT_EVENT_SEARCH_VERSION,
          calculatedAt: new Date().toISOString(),
          provider: { ...providerTrace! },
          natal: {
            input: structuredClone(natalChart.input),
            metadata: structuredClone(natalChart.metadata),
          },
          aspectPolicy: {
            id: MAJOR_ASPECT_POLICY_ID,
            version: MAJOR_ASPECT_POLICY_VERSION,
            definitions: this.aspectDefinitions.map((definition) => ({
              ...definition,
            })),
          },
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

function validateSearchInput(
  input: TransitEventSearchInput,
  definitions: readonly AspectDefinition[],
): Readonly<{
  startMilliseconds: number;
  endMilliseconds: number;
  aspect: AspectDefinition;
}> {
  if (!CELESTIAL_BODIES.includes(input.transitingBody))
    throw new RangeError("Unsupported transiting body");
  if (!ASPECT_TYPES.includes(input.aspectType))
    throw new RangeError("Unsupported transit aspect type");
  const startMilliseconds = parseUtcInstant(input.startInstant);
  const endMilliseconds = parseUtcInstant(input.endInstant);
  const durationMilliseconds = endMilliseconds - startMilliseconds;
  if (
    durationMilliseconds <= 0 ||
    durationMilliseconds > TRANSIT_EVENT_MAX_INTERVAL_DAYS * 86_400_000
  ) {
    throw new RangeError("Transit search interval is invalid or too large");
  }
  if (
    !Number.isInteger(input.sampleStepSeconds) ||
    input.sampleStepSeconds < 60 ||
    input.sampleStepSeconds * 1_000 >= durationMilliseconds ||
    Math.ceil(durationMilliseconds / (input.sampleStepSeconds * 1_000)) + 1 >
      TRANSIT_EVENT_MAX_INITIAL_SAMPLES
  ) {
    throw new RangeError("Transit search sample step is invalid");
  }
  if (
    !Number.isInteger(input.refinementToleranceSeconds) ||
    input.refinementToleranceSeconds < 1 ||
    input.refinementToleranceSeconds >= input.sampleStepSeconds
  ) {
    throw new RangeError("Transit search refinement tolerance is invalid");
  }
  if (
    !Number.isInteger(input.maxRefinementIterations) ||
    input.maxRefinementIterations < 1 ||
    input.maxRefinementIterations > 100
  ) {
    throw new RangeError("Transit search refinement limit is invalid");
  }
  const aspect = definitions.find(
    (definition) => definition.type === input.aspectType,
  );
  if (!aspect) throw new RangeError("Requested aspect is not configured");
  if (aspect.maximumOrbDegrees === 0)
    throw new RangeError("Transit event windows require a positive aspect orb");
  return { startMilliseconds, endMilliseconds, aspect };
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
  ) {
    values.push(instant);
  }
  values.push(endMilliseconds);
  return values;
}

function findActiveRuns(
  samples: readonly Evaluation[],
): readonly Readonly<{ startIndex: number; endIndex: number }>[] {
  const runs: { startIndex: number; endIndex: number }[] = [];
  let startIndex: number | undefined;
  samples.forEach((sample, index) => {
    if (sample.active && startIndex === undefined) startIndex = index;
    if (!sample.active && startIndex !== undefined) {
      runs.push({ startIndex, endIndex: index - 1 });
      startIndex = undefined;
    }
  });
  if (startIndex !== undefined)
    runs.push({ startIndex, endIndex: samples.length - 1 });
  return runs;
}

function findExactRootBrackets(
  samples: readonly Evaluation[],
  activeStartIndex: number,
  activeEndIndex: number,
  aspect: AspectDefinition,
): readonly RootBracket[] {
  const branches =
    aspect.exactAngleDegrees === 0 || aspect.exactAngleDegrees === 180
      ? [aspect.exactAngleDegrees]
      : [aspect.exactAngleDegrees, 360 - aspect.exactAngleDegrees];
  const roots: RootBracket[] = [];
  for (const branchAngleDegrees of branches) {
    for (
      let index = activeStartIndex - 1;
      index <= activeEndIndex;
      index += 1
    ) {
      const left = samples[index]!;
      const right = samples[index + 1]!;
      const leftError = signedBranchError(
        left.relativeLongitudeDegrees,
        branchAngleDegrees,
      );
      const rightError = signedBranchError(
        right.relativeLongitudeDegrees,
        branchAngleDegrees,
      );
      if (leftError === 0) {
        addUniqueRoot(roots, { branchAngleDegrees, exact: left });
      }
      if (rightError === 0) {
        addUniqueRoot(roots, { branchAngleDegrees, exact: right });
      }
      if (
        leftError * rightError < 0 &&
        Math.abs(leftError - rightError) < 180 &&
        (left.active || right.active)
      ) {
        addUniqueRoot(roots, { branchAngleDegrees, left, right });
      }
    }
  }
  return roots;
}

function addUniqueRoot(roots: RootBracket[], candidate: RootBracket): void {
  const candidateStart =
    candidate.exact?.epochMilliseconds ?? candidate.left!.epochMilliseconds;
  const candidateEnd =
    candidate.exact?.epochMilliseconds ?? candidate.right!.epochMilliseconds;
  if (
    roots.some((root) => {
      const rootStart =
        root.exact?.epochMilliseconds ?? root.left!.epochMilliseconds;
      const rootEnd =
        root.exact?.epochMilliseconds ?? root.right!.epochMilliseconds;
      return (
        root.branchAngleDegrees === candidate.branchAngleDegrees &&
        candidateStart <= rootEnd &&
        rootStart <= candidateEnd
      );
    })
  )
    return;
  roots.push(candidate);
}

async function refineScalarCrossing(
  initialLeft: Evaluation,
  initialRight: Evaluation,
  scalar: (evaluation: Evaluation) => number,
  toleranceMilliseconds: number,
  maxIterations: number,
  evaluate: (epochMilliseconds: number) => Promise<EvaluationResult>,
): Promise<EvaluationResult> {
  let left = initialLeft;
  let right = initialRight;
  let leftValue = scalar(left);
  let rightValue = scalar(right);
  if (leftValue === 0) return { ok: true, value: left };
  if (rightValue === 0) return { ok: true, value: right };
  if (leftValue * rightValue > 0) {
    return failure(
      "event-not-bracketed",
      "Refinement endpoints do not bracket the requested boundary",
    );
  }
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
    const midpointValue = scalar(result.value);
    if (midpointValue === 0) return result;
    if (leftValue * midpointValue < 0) {
      right = result.value;
      rightValue = midpointValue;
    } else {
      left = result.value;
      leftValue = midpointValue;
    }
    iterations += 1;
  }
  if (
    right.epochMilliseconds - left.epochMilliseconds >
    toleranceMilliseconds
  ) {
    return failure(
      "insufficient-precision",
      "Refinement limit was reached before the declared time tolerance",
    );
  }
  return Math.abs(leftValue) <= Math.abs(rightValue)
    ? { ok: true, value: left }
    : { ok: true, value: right };
}

function signedBranchError(
  relativeLongitudeDegrees: number,
  branchAngleDegrees: number,
): number {
  const difference = normalizeLongitude(
    relativeLongitudeDegrees - branchAngleDegrees,
  );
  return difference > 180 ? difference - 360 : difference;
}

function toEventPoint(evaluation: Evaluation): TransitEventPoint {
  return {
    instant: evaluation.instant,
    transitingLongitudeDegrees: evaluation.transitingLongitudeDegrees,
    actualAngleDegrees: evaluation.actualAngleDegrees,
    orbDegrees: evaluation.orbDegrees,
    normalizedStrength: evaluation.normalizedStrength,
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
  if (!match) throw new RangeError("Transit search requires UTC instants");
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
  ) {
    throw new RangeError("Transit search requires valid UTC instants");
  }
  return epochMilliseconds;
}

function failure(
  code: TransitEventSearchErrorCode,
  message: string,
): Readonly<{ ok: false; error: TransitEventSearchError }> {
  return { ok: false, error: { code, message, retryable: false } };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
