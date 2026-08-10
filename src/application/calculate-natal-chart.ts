import {
  DEFAULT_ASPECT_DEFINITIONS,
  findClosestAspect,
  validateAspectDefinitions,
  type AspectDefinition,
  type AspectMatch,
} from "@/domain/astro/aspects";
import {
  CELESTIAL_BODIES,
  type CelestialBody,
  type CelestialPosition,
  type CoordinateOrigin,
  type EphemerisProvider,
  type EphemerisProviderResult,
  type ObserverLocation,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import {
  findHouseNumber,
  WHOLE_SIGN_HOUSE_SYSTEM,
  WHOLE_SIGN_STRATEGY_VERSION,
} from "@/domain/astro/house-strategies";
import {
  getValidatedHouseCusps,
  getValidatedPositions,
} from "@/domain/astro/provider-validation";
import { toZodiacPosition, type ZodiacPosition } from "@/domain/astro/zodiac";

export const NATAL_CHART_ENGINE_VERSION = "1.0.0";
export const NATAL_ASPECT_POLICY_ID = "major-aspects";
export const NATAL_ASPECT_POLICY_VERSION = "1.0.0";

export interface NatalChartInput {
  /** The resolved birth instant in UTC. */
  instant: string;
  /** The IANA timezone used to resolve the original local birth time. */
  timezone: string;
  timezoneSource: string;
  observer: ObserverLocation;
  coordinateSource: string;
  coordinateOrigin: CoordinateOrigin;
  houseSystem: typeof WHOLE_SIGN_HOUSE_SYSTEM;
}

export interface NatalPlacement extends CelestialPosition {
  zodiac: ZodiacPosition;
  houseNumber: number;
}

export interface NatalAspect extends AspectMatch {
  firstBody: CelestialBody;
  secondBody: CelestialBody;
}

export interface NatalChartMetadata {
  chartEngineVersion: string;
  calculatedAt: string;
  positionProvider: ProviderMetadata;
  houseProvider: ProviderMetadata;
  houseStrategy: Readonly<{ id: string; version: string }>;
  aspectPolicy: Readonly<{
    id: string;
    version: string;
    definitions: readonly AspectDefinition[];
  }>;
}

export interface NatalChart {
  input: NatalChartInput;
  placements: readonly NatalPlacement[];
  houses: Readonly<{
    cuspsLongitudeDegrees: readonly number[];
    ascendantLongitudeDegrees: number;
    midheavenLongitudeDegrees: number;
  }>;
  aspects: readonly NatalAspect[];
  metadata: NatalChartMetadata;
}

export class NatalChartEngine {
  constructor(
    private readonly provider: EphemerisProvider,
    private readonly aspectDefinitions: readonly AspectDefinition[] = DEFAULT_ASPECT_DEFINITIONS,
  ) {
    validateAspectDefinitions(aspectDefinitions);
  }

  async calculate(
    input: NatalChartInput,
  ): Promise<EphemerisProviderResult<NatalChart>> {
    validateNatalProvenance(input);

    const positionResult = await getValidatedPositions(this.provider, {
      instant: input.instant,
      bodies: CELESTIAL_BODIES,
      observer: input.observer,
      zodiacReference: "tropical",
      coordinateOrigin: input.coordinateOrigin,
    });
    if (!positionResult.ok) return positionResult;

    const houseResult = await getValidatedHouseCusps(this.provider, {
      instant: input.instant,
      observer: input.observer,
      houseSystem: input.houseSystem,
      zodiacReference: "tropical",
    });
    if (!houseResult.ok) return houseResult;

    const positionsByBody = new Map(
      positionResult.value.positions.map((position) => [
        position.body,
        position,
      ]),
    );
    const orderedPositions = CELESTIAL_BODIES.map((body) =>
      positionsByBody.get(body)!,
    );
    const placements = orderedPositions.map((position) => ({
      ...position,
      zodiac: toZodiacPosition(position.eclipticLongitudeDegrees),
      houseNumber: findHouseNumber(
        position.eclipticLongitudeDegrees,
        houseResult.value.cuspsLongitudeDegrees,
      ),
    }));

    return {
      ok: true,
      value: {
        input: {
          ...input,
          observer: { ...input.observer },
        },
        placements,
        houses: {
          cuspsLongitudeDegrees: [...houseResult.value.cuspsLongitudeDegrees],
          ascendantLongitudeDegrees:
            houseResult.value.ascendantLongitudeDegrees,
          midheavenLongitudeDegrees:
            houseResult.value.midheavenLongitudeDegrees,
        },
        aspects: calculateNatalAspects(
          orderedPositions,
          this.aspectDefinitions,
        ),
        metadata: {
          chartEngineVersion: NATAL_CHART_ENGINE_VERSION,
          calculatedAt: new Date().toISOString(),
          positionProvider: positionResult.value.metadata,
          houseProvider: houseResult.value.metadata,
          houseStrategy: {
            id: WHOLE_SIGN_HOUSE_SYSTEM,
            version: WHOLE_SIGN_STRATEGY_VERSION,
          },
          aspectPolicy: {
            id: NATAL_ASPECT_POLICY_ID,
            version: NATAL_ASPECT_POLICY_VERSION,
            definitions: this.aspectDefinitions.map((definition) => ({
              ...definition,
            })),
          },
        },
      },
    };
  }
}

function calculateNatalAspects(
  positions: readonly CelestialPosition[],
  definitions: readonly AspectDefinition[],
): readonly NatalAspect[] {
  const aspects: NatalAspect[] = [];
  for (let firstIndex = 0; firstIndex < positions.length; firstIndex += 1) {
    const first = positions[firstIndex]!;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < positions.length;
      secondIndex += 1
    ) {
      const second = positions[secondIndex]!;
      const match = findClosestAspect(
        first.eclipticLongitudeDegrees,
        second.eclipticLongitudeDegrees,
        definitions,
        first.speedLongitudeDegreesPerDay !== undefined &&
          second.speedLongitudeDegreesPerDay !== undefined
          ? {
              firstSpeedDegreesPerDay: first.speedLongitudeDegreesPerDay,
              secondSpeedDegreesPerDay: second.speedLongitudeDegreesPerDay,
            }
          : undefined,
      );
      if (match) {
        aspects.push({
          firstBody: first.body,
          secondBody: second.body,
          ...match,
        });
      }
    }
  }
  return aspects;
}

function validateNatalProvenance(input: NatalChartInput): void {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone }).format();
  } catch {
    throw new RangeError("Natal timezone must be a valid IANA timezone");
  }
  validateSource(input.timezoneSource, "Timezone source");
  validateSource(input.coordinateSource, "Coordinate source");
}

function validateSource(value: string, label: string): void {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 128 ||
    /[\r\n]/.test(value)
  ) {
    throw new RangeError(`${label} must contain 1 to 128 characters`);
  }
}
