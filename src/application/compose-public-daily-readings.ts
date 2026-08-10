import {
  DEFAULT_ASPECT_DEFINITIONS,
  MAJOR_ASPECT_POLICY_ID,
  MAJOR_ASPECT_POLICY_VERSION,
  findClosestAspect,
  validateAspectDefinitions,
  type AspectDefinition,
  type AspectMatch,
} from "@/domain/astro/aspects";
import {
  CELESTIAL_BODIES,
  type CelestialBody,
  type EphemerisProvider,
  type EphemerisProviderResult,
  type PositionResult,
} from "@/domain/astro/contracts";
import { getValidatedPositions } from "@/domain/astro/provider-validation";
import { ZODIAC_SIGNS, type ZodiacSign } from "@/domain/astro/zodiac";
import type {
  InterpretationLibrary,
  InterpretationProjection,
} from "@/domain/interpretation/contracts";
import { PUBLIC_INTERPRETATION_LIBRARY } from "@/domain/interpretation/public-library";
import {
  LUNAR_PHASE_ENGINE_VERSION,
  deriveLunarPhase,
  type LunarPhaseResult,
} from "@/domain/lunar/phase";
import {
  renderInterpretations,
  type RenderedInterpretationOutput,
} from "./render-interpretations";
import type { InterpretationRenderData } from "./project-interpretations";

export const PUBLIC_DAILY_READING_VERSION = "1.0.0";
export const PUBLIC_DAILY_PROJECTION_VERSION = "1.0.0";
export const PUBLIC_SIGN_TARGET_CONVENTION = "tropical-sign-midpoint";
export const PUBLIC_DAILY_SKY_SAMPLE_CONVENTION = "utc-noon";

export interface PublicDailyReadingInput {
  readonly date: string;
}

export type PublicDailyFact =
  | Readonly<{
      id: string;
      kind: "shared-lunar-context";
      phase: LunarPhaseResult;
    }>
  | Readonly<{
      id: string;
      kind: "public-sun-sign-transit";
      transitingBody: CelestialBody;
      aspect: AspectMatch;
    }>;

export interface PublicSunSignReading {
  readonly id: string;
  readonly sunSign: ZodiacSign;
  readonly target: Readonly<{
    convention: typeof PUBLIC_SIGN_TARGET_CONVENTION;
    longitudeDegrees: number;
  }>;
  readonly facts: readonly PublicDailyFact[];
  readonly rendered: RenderedInterpretationOutput;
}

export interface PublicDailyReadings {
  readonly version: string;
  readonly date: string;
  readonly effectiveAt: string;
  readonly dayTimezone: "UTC";
  readonly sky: PositionResult;
  readonly readings: readonly PublicSunSignReading[];
  readonly metadata: Readonly<{
    projectionVersion: string;
    lunarEngineVersion: string;
    signTargetConvention: typeof PUBLIC_SIGN_TARGET_CONVENTION;
    skySampleConvention: typeof PUBLIC_DAILY_SKY_SAMPLE_CONVENTION;
    aspectPolicy: Readonly<{
      id: string;
      version: string;
      definitions: readonly AspectDefinition[];
    }>;
    library: Readonly<{ id: string; version: string; locale: string }>;
    composedAt: string;
  }>;
}

type PublicLibraryDescriptor = Readonly<{
  id: string;
  version: string;
  locale: string;
}>;

export class PublicDailyReadingEngine {
  constructor(
    private readonly provider: EphemerisProvider,
    private readonly library: InterpretationLibrary = PUBLIC_INTERPRETATION_LIBRARY,
    private readonly aspectDefinitions: readonly AspectDefinition[] = DEFAULT_ASPECT_DEFINITIONS,
  ) {
    validateAspectDefinitions(aspectDefinitions);
  }

  async calculate(
    input: PublicDailyReadingInput,
  ): Promise<EphemerisProviderResult<PublicDailyReadings>> {
    validateInput(input);
    const effectiveAt = `${input.date}T12:00:00Z`;
    const libraryDescriptor = this.libraryDescriptor();
    const sky = await getValidatedPositions(this.provider, {
      instant: effectiveAt,
      bodies: CELESTIAL_BODIES,
      zodiacReference: "tropical",
      coordinateOrigin: "geocentric",
    });
    if (!sky.ok) return sky;
    const sun = position(sky.value, "sun");
    const moon = position(sky.value, "moon");
    const lunar = deriveLunarPhase(
      sun.eclipticLongitudeDegrees,
      moon.eclipticLongitudeDegrees,
    );
    const readings = ZODIAC_SIGNS.map((sunSign, signIndex) =>
      this.buildReading(
        input.date,
        effectiveAt,
        sky.value,
        lunar,
        sunSign,
        signIndex,
        libraryDescriptor,
      ),
    );
    this.assertLibraryDescriptor(libraryDescriptor);
    return {
      ok: true,
      value: deepFreeze({
        version: PUBLIC_DAILY_READING_VERSION,
        date: input.date,
        effectiveAt,
        dayTimezone: "UTC" as const,
        sky: structuredClone(sky.value),
        readings,
        metadata: {
          projectionVersion: PUBLIC_DAILY_PROJECTION_VERSION,
          lunarEngineVersion: LUNAR_PHASE_ENGINE_VERSION,
          signTargetConvention: PUBLIC_SIGN_TARGET_CONVENTION,
          skySampleConvention: PUBLIC_DAILY_SKY_SAMPLE_CONVENTION,
          aspectPolicy: {
            id: MAJOR_ASPECT_POLICY_ID,
            version: MAJOR_ASPECT_POLICY_VERSION,
            definitions: structuredClone(this.aspectDefinitions),
          },
          library: libraryDescriptor,
          composedAt: new Date().toISOString(),
        },
      }),
    };
  }

  private buildReading(
    date: string,
    effectiveAt: string,
    sky: PositionResult,
    lunar: LunarPhaseResult,
    sunSign: ZodiacSign,
    signIndex: number,
    libraryDescriptor: PublicLibraryDescriptor,
  ): PublicSunSignReading {
    const targetLongitudeDegrees = signIndex * 30 + 15;
    const prefix = `public-daily:${date}:${sunSign}`;
    const facts: PublicDailyFact[] = [
      {
        id: `${prefix}:lunar`,
        kind: "shared-lunar-context",
        phase: structuredClone(lunar),
      },
    ];
    for (const body of CELESTIAL_BODIES) {
      const current = position(sky, body);
      const aspect = findClosestAspect(
        current.eclipticLongitudeDegrees,
        targetLongitudeDegrees,
        this.aspectDefinitions,
        current.speedLongitudeDegreesPerDay === undefined
          ? undefined
          : {
              firstSpeedDegreesPerDay: current.speedLongitudeDegreesPerDay,
              secondSpeedDegreesPerDay: 0,
            },
      );
      if (aspect)
        facts.push({
          id: `${prefix}:transit:${body}:${aspect.type}`,
          kind: "public-sun-sign-transit",
          transitingBody: body,
          aspect,
        });
    }
    const projections = facts.map((fact) =>
      projectionFor(fact, date, sunSign, targetLongitudeDegrees),
    );
    const items = projections.map((projection) => ({
      projection,
      resolution: this.library.resolve(projection.templateKey),
    }));
    const renderData: InterpretationRenderData = {
      effectiveAt,
      items,
      unsupportedKeys: items
        .filter((item) => !item.resolution.supported)
        .map((item) => item.projection.key),
      metadata: {
        projectionVersion: PUBLIC_DAILY_PROJECTION_VERSION,
        contextVersion: PUBLIC_DAILY_READING_VERSION,
        libraryId: libraryDescriptor.id,
        libraryVersion: libraryDescriptor.version,
        locale: libraryDescriptor.locale,
        preparedAt: new Date().toISOString(),
      },
    };
    return {
      id: prefix,
      sunSign,
      target: {
        convention: PUBLIC_SIGN_TARGET_CONVENTION,
        longitudeDegrees: targetLongitudeDegrees,
      },
      facts,
      rendered: renderInterpretations(renderData),
    };
  }

  private libraryDescriptor(): PublicLibraryDescriptor {
    return {
      id: this.library.id,
      version: this.library.version,
      locale: this.library.locale,
    };
  }

  private assertLibraryDescriptor(expected: PublicLibraryDescriptor): void {
    const actual = this.libraryDescriptor();
    if (
      actual.id !== expected.id ||
      actual.version !== expected.version ||
      actual.locale !== expected.locale
    ) {
      throw new RangeError(
        "Interpretation library metadata changed during composition",
      );
    }
  }
}

function projectionFor(
  fact: PublicDailyFact,
  date: string,
  sunSign: ZodiacSign,
  targetLongitudeDegrees: number,
): InterpretationProjection {
  return fact.kind === "shared-lunar-context"
    ? {
        key: `${fact.id}.projection`,
        templateKey: "public-lunar-context",
        sourceFactId: fact.id,
        tradition: "astrology",
        parameters: {
          date,
          sunSign,
          phase: fact.phase.phase,
          moonSign: fact.phase.moonZodiac.sign,
          phaseAngleDegrees: fact.phase.phaseAngleDegrees,
          approximateIlluminatedFraction:
            fact.phase.approximateIlluminatedFraction,
        },
      }
    : {
        key: `${fact.id}.projection`,
        templateKey: "public-sun-sign-transit",
        sourceFactId: fact.id,
        tradition: "astrology",
        parameters: {
          date,
          sunSign,
          targetLongitudeDegrees,
          transitingBody: fact.transitingBody,
          aspectType: fact.aspect.type,
          orbDegrees: fact.aspect.orbDegrees,
        },
      };
}

function validateInput(
  input: unknown,
): asserts input is PublicDailyReadingInput {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new RangeError("Invalid public daily reading input");

  const supplied = input as Record<string, unknown>;
  const keys = Object.keys(supplied);
  const date = supplied.date;
  const parsedDate =
    typeof date === "string" ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;
  if (
    keys.length !== 1 ||
    keys[0] !== "date" ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsedDate) ||
    new Date(parsedDate).toISOString().slice(0, 10) !== date
  )
    throw new RangeError("Invalid public daily reading input");
}

function position(result: PositionResult, body: CelestialBody) {
  return result.positions.find((item) => item.body === body)!;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
