import {
  composeTimelineFacts,
  type NumerologyBoundaryRequest,
  type TimelineFacts,
} from "./compose-timeline-facts";
import {
  LunarEventSearch,
  PRIMARY_LUNAR_PHASES,
  type LunarEventSearchOutput,
  type PrimaryLunarPhase,
} from "./search-lunar-events";
import {
  StationEventSearch,
  STATION_CAPABLE_BODIES,
  type StationEventSearchOutput,
  type StationEventType,
} from "./search-station-events";
import {
  TransitEventWindowSearch,
  type TransitEventWindow,
} from "./search-transit-event-window";
import {
  DEFAULT_ASPECT_DEFINITIONS,
  minimalAngularSeparation,
  type AspectDefinition,
  type AspectType,
} from "@/domain/astro/aspects";
import {
  CELESTIAL_BODIES,
  type CelestialBody,
  type EphemerisProvider,
  type EphemerisProviderError,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { getValidatedPositions } from "@/domain/astro/provider-validation";
import {
  normalizeLongitude,
  ZODIAC_SIGNS,
  type ZodiacSign,
} from "@/domain/astro/zodiac";
import { PythagoreanNumerology } from "@/domain/numerology/pythagorean";
import { resolveCivilTime } from "@/domain/time/civil-time";
import { MemoizedEphemerisProvider } from "@/infrastructure/ephemeris/memoized-ephemeris-provider";
import type { NatalChart } from "./calculate-natal-chart";
import { buildNatalTransitTargets } from "./calculate-transit-snapshot";

export const PERSONAL_TIMELINE_ENGINE_VERSION = "1.0.0";
export const PERSONAL_TIMELINE_POLICY_VERSION = "1.0.0";
export const PERSONAL_TIMELINE_MAX_REQUEST_DAYS = 45;

export type PersonalTimelineScope = "forecast" | "full-transit-calendar";

export interface PersonalTimelineInput {
  readonly startInstant: string;
  readonly endInstant: string;
  readonly birthDate: string;
  readonly scope: PersonalTimelineScope;
}

export interface PersonalTimelineAggregate {
  readonly input: Readonly<{
    requestedStartInstant: string;
    requestedEndInstant: string;
    effectiveStartInstant: string;
    effectiveEndInstant: string;
    scope: PersonalTimelineScope;
  }>;
  readonly timeline: TimelineFacts;
  readonly metadata: Readonly<{
    engineVersion: string;
    policyVersion: string;
    calculatedAt: string;
    truncated: boolean;
    truncationReasons: readonly (
      "plan-interval" | "event-limit" | "boundary-window"
    )[];
    coarseStepSeconds: number;
    coarseObservationCount: number;
    providerPositionCallCount: number;
    refinedEventCount: number;
    boundaryWindowOmissionCount: number;
    provider: ProviderMetadata;
  }>;
}

export type PersonalTimelineErrorCode =
  | EphemerisProviderError["code"]
  | "invalid-input"
  | "refinement-failed"
  | "civil-time-unavailable"
  | "inconsistent-provider-trace";

export type PersonalTimelineResult =
  | Readonly<{ ok: true; value: PersonalTimelineAggregate }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: PersonalTimelineErrorCode;
        message: string;
        retryable: boolean;
      }>;
    }>;

interface ScopePolicy {
  readonly maxDays: number;
  readonly eventLimit: number;
  readonly transitBodies: readonly CelestialBody[];
  readonly stationBodies: readonly CelestialBody[];
}

interface Observation {
  readonly epochMilliseconds: number;
  readonly instant: string;
  readonly longitude: ReadonlyMap<CelestialBody, number>;
  readonly speed: ReadonlyMap<CelestialBody, number>;
  readonly metadata: ProviderMetadata;
}

const COARSE_STEP_SECONDS = 43_200;
const REFINEMENT_TOLERANCE_SECONDS = 60;
const MAX_REFINEMENT_ITERATIONS = 24;

const POLICIES: Readonly<Record<PersonalTimelineScope, ScopePolicy>> = {
  forecast: {
    maxDays: 14,
    eventLimit: 96,
    transitBodies: [
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
    ],
    stationBodies: ["mercury", "venus", "mars", "jupiter", "saturn"],
  },
  "full-transit-calendar": {
    maxDays: 45,
    eventLimit: 256,
    transitBodies: CELESTIAL_BODIES,
    stationBodies: STATION_CAPABLE_BODIES,
  },
};

export class PersonalTimelineEngine {
  private readonly provider: EphemerisProvider;

  constructor(provider: EphemerisProvider) {
    this.provider = provider;
  }

  async calculate(
    natal: NatalChart,
    input: PersonalTimelineInput,
  ): Promise<PersonalTimelineResult> {
    let validated: ReturnType<typeof validateInput>;
    try {
      validated = validateInput(input);
    } catch {
      return failure(
        "invalid-input",
        "Personal timeline input is invalid",
        false,
      );
    }
    const policy = POLICIES[input.scope];
    const provider = new MemoizedEphemerisProvider(this.provider);
    const planEnd = validated.start + policy.maxDays * 86_400_000;
    const effectiveEnd = Math.min(validated.end, planEnd);
    const interval = {
      startInstant: new Date(validated.start).toISOString(),
      endInstant: new Date(effectiveEnd).toISOString(),
    };
    const observationsResult = await this.observe(
      provider,
      natal,
      validated.start,
      effectiveEnd,
    );
    if (!observationsResult.ok) return observationsResult;
    const observations = observationsResult.value;
    const providerMetadata = observations[0]!.metadata;
    const lunar: LunarEventSearchOutput[] = [];
    const stations: StationEventSearchOutput[] = [];
    const transits: TransitEventWindow[] = [];
    let boundaryWindowOmissionCount = 0;

    const lunarCandidates = lunarCrossings(observations);
    for (const candidate of lunarCandidates) {
      const bracket = expandedBracket(observations, candidate.index);
      if (!bracket) {
        boundaryWindowOmissionCount += 1;
        continue;
      }
      const result = await new LunarEventSearch(provider).search({
        ...bracket,
        ...(candidate.kind === "phase"
          ? { eventType: "primary-phase" as const, phase: candidate.target }
          : {
              eventType: "moon-sign-ingress" as const,
              enteredSign: candidate.target,
            }),
        ...provenance(natal),
        sampleStepSeconds: COARSE_STEP_SECONDS,
        refinementToleranceSeconds: REFINEMENT_TOLERANCE_SECONDS,
        maxRefinementIterations: MAX_REFINEMENT_ITERATIONS,
      });
      if (!result.ok) return refinementFailure(result.error);
      lunar.push(result.value);
    }

    const stationCandidates = stationCrossings(
      observations,
      policy.stationBodies,
    );
    for (const candidate of stationCandidates) {
      const bracket = expandedBracket(observations, candidate.index);
      if (!bracket) {
        boundaryWindowOmissionCount += 1;
        continue;
      }
      const result = await new StationEventSearch(provider).search({
        ...bracket,
        eventType: candidate.type,
        body: candidate.body,
        ...provenance(natal),
        sampleStepSeconds: COARSE_STEP_SECONDS,
        refinementToleranceSeconds: REFINEMENT_TOLERANCE_SECONDS,
        maxRefinementIterations: MAX_REFINEMENT_ITERATIONS,
      });
      if (!result.ok) return refinementFailure(result.error);
      stations.push(result.value);
    }

    const transitCandidates = transitWindows(
      natal,
      observations,
      policy.transitBodies,
      DEFAULT_ASPECT_DEFINITIONS,
    );
    boundaryWindowOmissionCount += transitCandidates.boundaryOmissions;
    for (const candidate of transitCandidates.candidates) {
      const result = await new TransitEventWindowSearch(provider).search(
        natal,
        {
          startInstant: observations[candidate.startIndex - 1]!.instant,
          endInstant: observations[candidate.endIndex + 1]!.instant,
          transitingBody: candidate.body,
          natalTargetId: candidate.targetId,
          aspectType: candidate.aspect,
          ...provenance(natal),
          sampleStepSeconds: COARSE_STEP_SECONDS,
          refinementToleranceSeconds: REFINEMENT_TOLERANCE_SECONDS,
          maxRefinementIterations: MAX_REFINEMENT_ITERATIONS,
        },
      );
      if (!result.ok) return refinementFailure(result.error);
      transits.push(result.value);
    }

    const numerology = numerologyBoundaries(
      natal.input.timezone,
      natal.input.timezoneSource,
      interval.startInstant,
      interval.endInstant,
    );
    if (!numerology.ok) return numerology;

    const orderedSources = [...transits, ...lunar, ...stations].sort(
      (left, right) => sourceInstant(left) - sourceInstant(right),
    );
    const reasons: ("plan-interval" | "event-limit" | "boundary-window")[] = [];
    if (effectiveEnd < validated.end) reasons.push("plan-interval");
    if (orderedSources.length > policy.eventLimit) reasons.push("event-limit");
    if (boundaryWindowOmissionCount > 0) reasons.push("boundary-window");
    const accepted = orderedSources.slice(0, policy.eventLimit);
    const timeline = composeTimelineFacts(
      {
        interval,
        transitEvents: accepted.filter(isTransit),
        lunarEvents: accepted.filter(isLunar),
        stationEvents: accepted.filter(isStation),
        numerology: {
          birthDate: input.birthDate,
          boundaries: numerology.value,
        },
      },
      new PythagoreanNumerology(),
    );
    return {
      ok: true,
      value: deepFreeze({
        input: {
          requestedStartInstant: input.startInstant,
          requestedEndInstant: input.endInstant,
          effectiveStartInstant: interval.startInstant,
          effectiveEndInstant: interval.endInstant,
          scope: input.scope,
        },
        timeline,
        metadata: {
          engineVersion: PERSONAL_TIMELINE_ENGINE_VERSION,
          policyVersion: PERSONAL_TIMELINE_POLICY_VERSION,
          calculatedAt: new Date().toISOString(),
          truncated: reasons.length > 0,
          truncationReasons: reasons,
          coarseStepSeconds: COARSE_STEP_SECONDS,
          coarseObservationCount: observations.length,
          providerPositionCallCount: provider.providerPositionCallCount,
          refinedEventCount: accepted.length,
          boundaryWindowOmissionCount,
          provider: providerMetadata,
        },
      }),
    };
  }

  private async observe(
    provider: MemoizedEphemerisProvider,
    natal: NatalChart,
    start: number,
    end: number,
  ): Promise<
    | Readonly<{ ok: true; value: readonly Observation[] }>
    | Extract<PersonalTimelineResult, { ok: false }>
  > {
    const values: Observation[] = [];
    let expectedTrace: ProviderMetadata | undefined;
    for (const epochMilliseconds of sampleInstants(start, end)) {
      const instant = new Date(epochMilliseconds).toISOString();
      const result = await getValidatedPositions(provider, {
        instant,
        bodies: CELESTIAL_BODIES,
        ...(natal.input.observer ? { observer: natal.input.observer } : {}),
        zodiacReference: "tropical",
        coordinateOrigin: natal.input.coordinateOrigin,
      });
      if (!result.ok) return { ok: false, error: result.error };
      if (expectedTrace && !sameTrace(expectedTrace, result.value.metadata))
        return failure(
          "inconsistent-provider-trace",
          "Provider trace changed during personal timeline observation",
          false,
        );
      expectedTrace ??= result.value.metadata;
      values.push({
        epochMilliseconds,
        instant,
        longitude: new Map(
          result.value.positions.map((position) => [
            position.body,
            position.eclipticLongitudeDegrees,
          ]),
        ),
        speed: new Map(
          result.value.positions.flatMap((position) =>
            position.speedLongitudeDegreesPerDay === undefined
              ? []
              : [
                  [
                    position.body,
                    position.speedLongitudeDegreesPerDay,
                  ] as const,
                ],
          ),
        ),
        metadata: result.value.metadata,
      });
    }
    return { ok: true, value: values };
  }
}

function validateInput(input: PersonalTimelineInput) {
  if (input.scope !== "forecast" && input.scope !== "full-transit-calendar")
    throw new RangeError();
  const start = canonicalInstant(input.startInstant);
  const end = canonicalInstant(input.endInstant);
  new PythagoreanNumerology().calculateLifePath(input.birthDate);
  if (
    end <= start ||
    end - start > PERSONAL_TIMELINE_MAX_REQUEST_DAYS * 86_400_000
  )
    throw new RangeError();
  return { start, end };
}

function sampleInstants(start: number, end: number) {
  const step = COARSE_STEP_SECONDS * 1_000;
  const values: number[] = [];
  for (let value = start; value < end; value += step) values.push(value);
  values.push(end);
  return values;
}

function lunarCrossings(observations: readonly Observation[]) {
  const candidates: Array<
    | { kind: "phase"; target: PrimaryLunarPhase; index: number }
    | { kind: "sign"; target: ZodiacSign; index: number }
  > = [];
  for (let index = 0; index < observations.length - 1; index += 1) {
    const left = observations[index]!;
    const right = observations[index + 1]!;
    const leftMoon = left.longitude.get("moon")!;
    const rightMoon = right.longitude.get("moon")!;
    const leftPhase = normalizeLongitude(leftMoon - left.longitude.get("sun")!);
    const rightPhase = normalizeLongitude(
      rightMoon - right.longitude.get("sun")!,
    );
    PRIMARY_LUNAR_PHASES.forEach((target, targetIndex) => {
      if (crossesIncreasing(leftPhase, rightPhase, targetIndex * 90))
        candidates.push({ kind: "phase", target, index });
    });
    ZODIAC_SIGNS.forEach((target, targetIndex) => {
      if (crossesIncreasing(leftMoon, rightMoon, targetIndex * 30))
        candidates.push({ kind: "sign", target, index });
    });
  }
  return candidates;
}

function stationCrossings(
  observations: readonly Observation[],
  bodies: readonly CelestialBody[],
) {
  const candidates: Array<{
    body: CelestialBody;
    type: StationEventType;
    index: number;
  }> = [];
  for (const body of bodies) {
    for (let index = 0; index < observations.length - 1; index += 1) {
      const left = observations[index]!.speed.get(body);
      const right = observations[index + 1]!.speed.get(body);
      if (
        left === undefined ||
        right === undefined ||
        left === 0 ||
        right === 0
      )
        continue;
      if (left > 0 && right < 0)
        candidates.push({ body, type: "station-retrograde", index });
      if (left < 0 && right > 0)
        candidates.push({ body, type: "station-direct", index });
    }
  }
  return candidates;
}

function transitWindows(
  natal: NatalChart,
  observations: readonly Observation[],
  bodies: readonly CelestialBody[],
  definitions: readonly AspectDefinition[],
) {
  const candidates: Array<{
    body: CelestialBody;
    targetId: ReturnType<typeof buildNatalTransitTargets>[number]["id"];
    aspect: AspectType;
    startIndex: number;
    endIndex: number;
  }> = [];
  let boundaryOmissions = 0;
  for (const body of bodies) {
    for (const target of buildNatalTransitTargets(natal)) {
      for (const aspect of definitions) {
        let startIndex: number | undefined;
        observations.forEach((observation, index) => {
          const angle = minimalAngularSeparation(
            observation.longitude.get(body)!,
            target.longitudeDegrees,
          );
          const active =
            Math.abs(angle - aspect.exactAngleDegrees) <=
            aspect.maximumOrbDegrees;
          if (active && startIndex === undefined) startIndex = index;
          if (!active && startIndex !== undefined) {
            const endIndex = index - 1;
            if (startIndex > 0 && endIndex < observations.length - 1)
              candidates.push({
                body,
                targetId: target.id,
                aspect: aspect.type,
                startIndex,
                endIndex,
              });
            else boundaryOmissions += 1;
            startIndex = undefined;
          }
        });
        if (startIndex !== undefined) boundaryOmissions += 1;
      }
    }
  }
  return { candidates, boundaryOmissions };
}

function expandedBracket(observations: readonly Observation[], index: number) {
  if (index < 1 || index + 2 >= observations.length) return null;
  return {
    startInstant: observations[index - 1]!.instant,
    endInstant: observations[index + 2]!.instant,
  };
}

function crossesIncreasing(left: number, right: number, target: number) {
  const travel = normalizeLongitude(right - left);
  const distance = normalizeLongitude(target - left);
  return travel > 0 && travel < 180 && distance > 0 && distance <= travel;
}

function provenance(natal: NatalChart) {
  return {
    coordinateOrigin: natal.input.coordinateOrigin,
    ...(natal.input.observer ? { observer: natal.input.observer } : {}),
    ...(natal.input.coordinateSource
      ? { coordinateSource: natal.input.coordinateSource }
      : {}),
  };
}

function numerologyBoundaries(
  timezone: string,
  timezoneSource: string,
  startInstant: string,
  endInstant: string,
):
  | Readonly<{ ok: true; value: readonly NumerologyBoundaryRequest[] }>
  | Extract<PersonalTimelineResult, { ok: false }> {
  const startDate = localDateAt(startInstant, timezone);
  const end = Date.parse(endInstant);
  const values: NumerologyBoundaryRequest[] = [];
  for (let date = nextDate(startDate); ; date = nextDate(date)) {
    const resolution = resolveCivilTime({ date, time: "00:00", timezone });
    if (resolution.status !== "unique")
      return failure(
        "civil-time-unavailable",
        "A local numerology boundary could not be resolved uniquely",
        false,
      );
    const epoch = Date.parse(resolution.instant);
    if (epoch >= end) break;
    const base = {
      localDate: date,
      instant: resolution.instant,
      timezone,
      timezoneSource,
    };
    values.push({ kind: "personal-day", ...base });
    if (date.endsWith("-01")) values.push({ kind: "personal-month", ...base });
    if (date.endsWith("-01-01"))
      values.push({ kind: "personal-year", ...base });
  }
  return { ok: true, value: values };
}

function localDateAt(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const fields = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function nextDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + 1, 12));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function canonicalInstant(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value)
    throw new RangeError();
  return parsed;
}

function sourceInstant(
  value: TransitEventWindow | LunarEventSearchOutput | StationEventSearchOutput,
) {
  return "peak" in value.event
    ? Date.parse(value.event.peak.instant)
    : value.event.type === "primary-phase" ||
        value.event.type === "moon-sign-ingress"
      ? Date.parse(value.event.point.instant)
      : Date.parse(value.event.instant);
}

function isTransit(
  value: TransitEventWindow | LunarEventSearchOutput | StationEventSearchOutput,
): value is TransitEventWindow {
  return "peak" in value.event;
}

function isLunar(
  value: TransitEventWindow | LunarEventSearchOutput | StationEventSearchOutput,
): value is LunarEventSearchOutput {
  return (
    "type" in value.event &&
    (value.event.type === "primary-phase" ||
      value.event.type === "moon-sign-ingress")
  );
}

function isStation(
  value: TransitEventWindow | LunarEventSearchOutput | StationEventSearchOutput,
): value is StationEventSearchOutput {
  return (
    "type" in value.event &&
    (value.event.type === "station-direct" ||
      value.event.type === "station-retrograde")
  );
}

function refinementFailure(error: { code: string; retryable: boolean }) {
  return failure(
    error.code === "data-unavailable" ||
      error.code === "provider-unavailable" ||
      error.code === "invalid-provider-response"
      ? (error.code as PersonalTimelineErrorCode)
      : "refinement-failed",
    "A detected timeline event could not be refined completely",
    error.retryable,
  );
}

function failure(
  code: PersonalTimelineErrorCode,
  message: string,
  retryable: boolean,
): Extract<PersonalTimelineResult, { ok: false }> {
  return { ok: false, error: { code, message, retryable } };
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

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
