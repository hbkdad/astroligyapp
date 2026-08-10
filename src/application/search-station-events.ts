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
import { toZodiacPosition, type ZodiacPosition } from "@/domain/astro/zodiac";

export const STATION_EVENT_SEARCH_VERSION = "1.0.0";
export const STATION_EVENT_MAX_INTERVAL_DAYS = 400;
export const STATION_EVENT_MAX_INITIAL_SAMPLES = 2_048;
export const STATION_CAPABLE_BODIES: readonly CelestialBody[] =
  CELESTIAL_BODIES.filter((body) => body !== "sun" && body !== "moon");

export type StationEventType = "station-retrograde" | "station-direct";

export interface StationEventSearchInput {
  eventType: StationEventType;
  body: CelestialBody;
  startInstant: string;
  endInstant: string;
  coordinateOrigin: CoordinateOrigin;
  observer?: ObserverLocation;
  coordinateSource?: string;
  sampleStepSeconds: number;
  refinementToleranceSeconds: number;
  maxRefinementIterations: number;
}

export interface StationEventSearchOutput {
  input: StationEventSearchInput;
  event: Readonly<{
    id: string;
    type: StationEventType;
    body: CelestialBody;
    instant: string;
    longitudeDegrees: number;
    zodiac: ZodiacPosition;
    speedLongitudeDegreesPerDay: number;
    motionBefore: "direct" | "retrograde";
    motionAfter: "direct" | "retrograde";
    bracket: Readonly<{
      beforeInstant: string;
      beforeSpeedLongitudeDegreesPerDay: number;
      afterInstant: string;
      afterSpeedLongitudeDegreesPerDay: number;
    }>;
  }>;
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
      longitudeDegrees: number;
      speedLongitudeDegreesPerDay: number;
      providerCalculatedAt: string;
    }>[];
  }>;
}

export type StationEventSearchErrorCode =
  | EphemerisProviderError["code"]
  | "speed-unavailable"
  | "event-not-bracketed"
  | "ambiguous-event"
  | "insufficient-precision"
  | "inconsistent-provider-trace";

export interface StationEventSearchError {
  code: StationEventSearchErrorCode;
  message: string;
  retryable: boolean;
}

export type StationEventSearchResult =
  | Readonly<{ ok: true; value: StationEventSearchOutput }>
  | Readonly<{ ok: false; error: StationEventSearchError }>;

interface Evaluation {
  epochMilliseconds: number;
  instant: string;
  longitudeDegrees: number;
  speedDegreesPerDay: number;
  metadata: ProviderMetadata;
}

type EvaluationResult =
  | Readonly<{ ok: true; value: Evaluation }>
  | Readonly<{ ok: false; error: StationEventSearchError }>;

type Root =
  | Readonly<{ exact: Evaluation; before: Evaluation; after: Evaluation }>
  | Readonly<{ before: Evaluation; after: Evaluation }>;

export class StationEventSearch {
  constructor(private readonly provider: EphemerisProvider) {}

  async search(
    input: StationEventSearchInput,
  ): Promise<StationEventSearchResult> {
    const validated = validateInput(input);
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
        bodies: [input.body],
        ...(input.observer ? { observer: input.observer } : {}),
        zodiacReference: "tropical",
        coordinateOrigin: input.coordinateOrigin,
      });
      if (!result.ok) return result;
      if (
        providerTrace &&
        !sameProviderTrace(providerTrace, result.value.metadata)
      )
        return failure(
          "inconsistent-provider-trace",
          "Ephemeris provider trace changed during station search",
        );
      providerTrace ??= result.value.metadata;
      const position = result.value.positions[0]!;
      if (position.speedLongitudeDegreesPerDay === undefined)
        return failure(
          "speed-unavailable",
          "Ephemeris provider did not supply longitudinal speed",
        );
      const evaluation: Evaluation = {
        epochMilliseconds,
        instant,
        longitudeDegrees: position.eclipticLongitudeDegrees,
        speedDegreesPerDay: position.speedLongitudeDegreesPerDay,
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
    const roots = findRoots(samples, input.eventType);
    if (roots.length > 1)
      return failure(
        "ambiguous-event",
        "Search interval contains more than one matching station",
      );
    const root = roots[0];
    if (!root)
      return failure(
        "event-not-bracketed",
        "Search interval does not bracket the requested station",
      );
    const refined =
      "exact" in root
        ? ({
            ok: true,
            value: {
              station: root.exact,
              before: root.before,
              after: root.after,
            },
          } as const)
        : await refineRoot(
            root.before,
            root.after,
            input.eventType,
            input.refinementToleranceSeconds * 1_000,
            input.maxRefinementIterations,
            evaluate,
          );
    if (!refined.ok) return refined;

    const { station, before, after } = refined.value;
    const evaluations = [...cache.values()]
      .sort((left, right) => left.epochMilliseconds - right.epochMilliseconds)
      .map((evaluation) => ({
        instant: evaluation.instant,
        longitudeDegrees: evaluation.longitudeDegrees,
        speedLongitudeDegreesPerDay: evaluation.speedDegreesPerDay,
        providerCalculatedAt: evaluation.metadata.calculatedAt,
      }));
    return {
      ok: true,
      value: deepFreeze({
        input: structuredClone(input),
        event: {
          id: `station:${input.body}:${input.eventType}:${station.instant}`,
          type: input.eventType,
          body: input.body,
          instant: station.instant,
          longitudeDegrees: station.longitudeDegrees,
          zodiac: toZodiacPosition(station.longitudeDegrees),
          speedLongitudeDegreesPerDay: station.speedDegreesPerDay,
          motionBefore:
            input.eventType === "station-retrograde" ? "direct" : "retrograde",
          motionAfter:
            input.eventType === "station-retrograde" ? "retrograde" : "direct",
          bracket: {
            beforeInstant: before.instant,
            beforeSpeedLongitudeDegreesPerDay: before.speedDegreesPerDay,
            afterInstant: after.instant,
            afterSpeedLongitudeDegreesPerDay: after.speedDegreesPerDay,
          },
        },
        metadata: {
          searchEngineVersion: STATION_EVENT_SEARCH_VERSION,
          calculatedAt: new Date().toISOString(),
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

function validateInput(input: StationEventSearchInput): Readonly<{
  startMilliseconds: number;
  endMilliseconds: number;
}> {
  if (!STATION_CAPABLE_BODIES.includes(input.body))
    throw new RangeError("Unsupported station body");
  if (
    input.eventType !== "station-retrograde" &&
    input.eventType !== "station-direct"
  )
    throw new RangeError("Unsupported station event type");
  const startMilliseconds = parseUtcInstant(input.startInstant);
  const endMilliseconds = parseUtcInstant(input.endInstant);
  const duration = endMilliseconds - startMilliseconds;
  if (duration <= 0 || duration > STATION_EVENT_MAX_INTERVAL_DAYS * 86_400_000)
    throw new RangeError("Station search interval is invalid or too large");
  if (
    !Number.isInteger(input.sampleStepSeconds) ||
    input.sampleStepSeconds < 300 ||
    input.sampleStepSeconds > 604_800 ||
    input.sampleStepSeconds * 1_000 >= duration ||
    Math.ceil(duration / (input.sampleStepSeconds * 1_000)) + 1 >
      STATION_EVENT_MAX_INITIAL_SAMPLES
  )
    throw new RangeError("Station search sample step is invalid");
  if (
    !Number.isInteger(input.refinementToleranceSeconds) ||
    input.refinementToleranceSeconds < 1 ||
    input.refinementToleranceSeconds >= input.sampleStepSeconds
  )
    throw new RangeError("Station search refinement tolerance is invalid");
  if (
    !Number.isInteger(input.maxRefinementIterations) ||
    input.maxRefinementIterations < 1 ||
    input.maxRefinementIterations > 100
  )
    throw new RangeError("Station search refinement limit is invalid");
  validateCoordinateProvenance(input);
  return { startMilliseconds, endMilliseconds };
}

function findRoots(
  samples: readonly Evaluation[],
  eventType: StationEventType,
): readonly Root[] {
  const roots: Root[] = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    const before = samples[index]!;
    const after = samples[index + 1]!;
    if (crosses(before.speedDegreesPerDay, after.speedDegreesPerDay, eventType))
      roots.push({ before, after });
  }
  for (let index = 1; index < samples.length - 1; index += 1) {
    if (
      samples[index]!.speedDegreesPerDay === 0 &&
      crosses(
        samples[index - 1]!.speedDegreesPerDay,
        samples[index + 1]!.speedDegreesPerDay,
        eventType,
      )
    )
      roots.push({
        exact: samples[index]!,
        before: samples[index - 1]!,
        after: samples[index + 1]!,
      });
  }
  return roots;
}

function crosses(
  before: number,
  after: number,
  eventType: StationEventType,
): boolean {
  return eventType === "station-retrograde"
    ? before > 0 && after < 0
    : before < 0 && after > 0;
}

async function refineRoot(
  initialBefore: Evaluation,
  initialAfter: Evaluation,
  eventType: StationEventType,
  toleranceMilliseconds: number,
  maxIterations: number,
  evaluate: (epochMilliseconds: number) => Promise<EvaluationResult>,
): Promise<
  | Readonly<{
      ok: true;
      value: {
        station: Evaluation;
        before: Evaluation;
        after: Evaluation;
      };
    }>
  | Readonly<{ ok: false; error: StationEventSearchError }>
> {
  let before = initialBefore;
  let after = initialAfter;
  let iterations = 0;
  while (
    after.epochMilliseconds - before.epochMilliseconds >
      toleranceMilliseconds &&
    iterations < maxIterations
  ) {
    const midpoint = Math.floor(
      (before.epochMilliseconds + after.epochMilliseconds) / 2,
    );
    if (
      midpoint === before.epochMilliseconds ||
      midpoint === after.epochMilliseconds
    )
      break;
    const result = await evaluate(midpoint);
    if (!result.ok) return result;
    if (result.value.speedDegreesPerDay === 0)
      return {
        ok: true,
        value: { station: result.value, before, after },
      };
    const belongsBefore =
      eventType === "station-retrograde"
        ? result.value.speedDegreesPerDay > 0
        : result.value.speedDegreesPerDay < 0;
    if (belongsBefore) before = result.value;
    else after = result.value;
    iterations += 1;
  }
  if (
    after.epochMilliseconds - before.epochMilliseconds >
    toleranceMilliseconds
  )
    return failure(
      "insufficient-precision",
      "Refinement limit was reached before the declared time tolerance",
    );
  return {
    ok: true,
    value: {
      station:
        Math.abs(before.speedDegreesPerDay) <=
        Math.abs(after.speedDegreesPerDay)
          ? before
          : after,
      before,
      after,
    },
  };
}

function buildInitialInstants(
  start: number,
  end: number,
  step: number,
): number[] {
  const values: number[] = [];
  for (let instant = start; instant < end; instant += step)
    values.push(instant);
  values.push(end);
  return values;
}

function validateCoordinateProvenance(input: StationEventSearchInput): void {
  if (
    input.coordinateOrigin === "topocentric" &&
    (!input.observer || !validSource(input.coordinateSource))
  )
    throw new RangeError(
      "Topocentric station searches require observer provenance",
    );
  if (
    input.coordinateOrigin === "geocentric" &&
    (input.observer !== undefined || input.coordinateSource !== undefined)
  )
    throw new RangeError(
      "Geocentric station searches must omit observer provenance",
    );
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
  if (!match) throw new RangeError("Station search requires UTC instants");
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const epoch = Date.parse(value);
  const parsed = new Date(epoch);
  if (
    !Number.isFinite(epoch) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  )
    throw new RangeError("Station search requires valid UTC instants");
  return epoch;
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
  code: StationEventSearchErrorCode,
  message: string,
): Readonly<{ ok: false; error: StationEventSearchError }> {
  return { ok: false, error: { code, message, retryable: false } };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
