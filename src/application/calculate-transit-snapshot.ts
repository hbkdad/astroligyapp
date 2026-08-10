import {
  DEFAULT_ASPECT_DEFINITIONS,
  findClosestAspect,
  MAJOR_ASPECT_POLICY_ID,
  MAJOR_ASPECT_POLICY_VERSION,
  validateAspectDefinitions,
  type AspectDefinition,
  type AspectMatch,
} from "@/domain/astro/aspects";
import {
  CELESTIAL_BODIES,
  type CelestialBody,
  type CoordinateOrigin,
  type EphemerisProvider,
  type EphemerisProviderResult,
  type ObserverLocation,
  type PositionResult,
} from "@/domain/astro/contracts";
import { getValidatedPositions } from "@/domain/astro/provider-validation";
import type {
  NatalChart,
  NatalChartInput,
  NatalChartMetadata,
} from "./calculate-natal-chart";

export const TRANSIT_SNAPSHOT_ENGINE_VERSION = "1.0.0";

export interface TransitSnapshotInput {
  /** Current comparison instant in UTC. */
  instant: string;
  coordinateOrigin: CoordinateOrigin;
  observer?: ObserverLocation;
  coordinateSource?: string;
}

export type NatalTransitTarget =
  | Readonly<{
      id: `natal:body:${CelestialBody}`;
      kind: "body";
      body: CelestialBody;
      longitudeDegrees: number;
    }>
  | Readonly<{
      id: "natal:angle:ascendant" | "natal:angle:midheaven";
      kind: "angle";
      angle: "ascendant" | "midheaven";
      longitudeDegrees: number;
    }>;

export interface TransitAspect extends AspectMatch {
  transitingBody: CelestialBody;
  natalTarget: NatalTransitTarget;
}

export interface TransitSnapshot {
  input: TransitSnapshotInput;
  sky: PositionResult;
  natal: Readonly<{
    input: NatalChartInput;
    metadata: NatalChartMetadata;
  }>;
  aspects: readonly TransitAspect[];
  metadata: Readonly<{
    transitEngineVersion: string;
    calculatedAt: string;
    aspectPolicy: Readonly<{
      id: string;
      version: string;
      definitions: readonly AspectDefinition[];
    }>;
  }>;
}

export class TransitSnapshotEngine {
  constructor(
    private readonly provider: EphemerisProvider,
    private readonly aspectDefinitions: readonly AspectDefinition[] = DEFAULT_ASPECT_DEFINITIONS,
  ) {
    validateAspectDefinitions(aspectDefinitions);
  }

  async calculate(
    natalChart: NatalChart,
    input: TransitSnapshotInput,
  ): Promise<EphemerisProviderResult<TransitSnapshot>> {
    validateNatalTransitTargets(natalChart);
    validateTransitInputProvenance(input);

    const skyResult = await getValidatedPositions(this.provider, {
      instant: input.instant,
      bodies: CELESTIAL_BODIES,
      ...(input.observer ? { observer: input.observer } : {}),
      zodiacReference: "tropical",
      coordinateOrigin: input.coordinateOrigin,
    });
    if (!skyResult.ok) return skyResult;

    const natalTargets = buildNatalTransitTargets(natalChart);
    const aspects: TransitAspect[] = [];
    const skyByBody = new Map(
      skyResult.value.positions.map((position) => [position.body, position]),
    );
    for (const transitingBody of CELESTIAL_BODIES) {
      const position = skyByBody.get(transitingBody)!;
      for (const natalTarget of natalTargets) {
        const match = findClosestAspect(
          position.eclipticLongitudeDegrees,
          natalTarget.longitudeDegrees,
          this.aspectDefinitions,
          position.speedLongitudeDegreesPerDay === undefined
            ? undefined
            : {
                firstSpeedDegreesPerDay: position.speedLongitudeDegreesPerDay,
                secondSpeedDegreesPerDay: 0,
              },
        );
        if (match) {
          aspects.push({ transitingBody, natalTarget, ...match });
        }
      }
    }

    return {
      ok: true,
      value: {
        input: {
          ...input,
          ...(input.observer ? { observer: { ...input.observer } } : {}),
        },
        sky: skyResult.value,
        natal: {
          input: natalChart.input,
          metadata: natalChart.metadata,
        },
        aspects,
        metadata: {
          transitEngineVersion: TRANSIT_SNAPSHOT_ENGINE_VERSION,
          calculatedAt: new Date().toISOString(),
          aspectPolicy: {
            id: MAJOR_ASPECT_POLICY_ID,
            version: MAJOR_ASPECT_POLICY_VERSION,
            definitions: this.aspectDefinitions.map((definition) => ({
              ...definition,
            })),
          },
        },
      },
    };
  }
}

export function buildNatalTransitTargets(
  natalChart: NatalChart,
): readonly NatalTransitTarget[] {
  const placements = new Map(
    natalChart.placements.map((placement) => [placement.body, placement]),
  );
  return [
    ...CELESTIAL_BODIES.map((body) => ({
      id: `natal:body:${body}` as const,
      kind: "body" as const,
      body,
      longitudeDegrees: placements.get(body)!.eclipticLongitudeDegrees,
    })),
    {
      id: "natal:angle:ascendant",
      kind: "angle",
      angle: "ascendant",
      longitudeDegrees: natalChart.houses.ascendantLongitudeDegrees,
    },
    {
      id: "natal:angle:midheaven",
      kind: "angle",
      angle: "midheaven",
      longitudeDegrees: natalChart.houses.midheavenLongitudeDegrees,
    },
  ];
}

export function validateNatalTransitTargets(natalChart: NatalChart): void {
  if (natalChart.placements.length !== CELESTIAL_BODIES.length) {
    throw new RangeError("Natal chart must contain every supported body");
  }
  const seen = new Set<CelestialBody>();
  for (const placement of natalChart.placements) {
    if (
      !CELESTIAL_BODIES.includes(placement.body) ||
      seen.has(placement.body) ||
      !isNormalizedLongitude(placement.eclipticLongitudeDegrees)
    ) {
      throw new RangeError("Natal chart contains invalid placements");
    }
    seen.add(placement.body);
  }
  if (
    !isNormalizedLongitude(natalChart.houses.ascendantLongitudeDegrees) ||
    !isNormalizedLongitude(natalChart.houses.midheavenLongitudeDegrees)
  ) {
    throw new RangeError("Natal chart contains invalid angles");
  }
}

export function validateTransitInputProvenance(
  input: TransitSnapshotInput,
): void {
  if (
    input.coordinateOrigin === "topocentric" &&
    (!input.observer || !validSource(input.coordinateSource))
  ) {
    throw new RangeError(
      "Topocentric transits require an observer and coordinate source",
    );
  }
  if (
    input.coordinateOrigin === "geocentric" &&
    (input.observer !== undefined || input.coordinateSource !== undefined)
  ) {
    throw new RangeError(
      "Geocentric transits must omit observer location and coordinate source",
    );
  }
}

function validSource(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    Boolean(value.trim()) &&
    value.length <= 128 &&
    !/[\r\n]/.test(value)
  );
}

function isNormalizedLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 360;
}
