import type { CelestialPosition } from "@/domain/astro/contracts";
import {
  deriveLunarPhase,
  LUNAR_PHASE_ENGINE_VERSION,
  type LunarPhaseResult,
} from "@/domain/lunar/phase";
import type {
  TransitAspect,
  TransitSnapshot,
  TransitSnapshotInput,
} from "./calculate-transit-snapshot";
import type {
  NatalChartInput,
  NatalChartMetadata,
} from "./calculate-natal-chart";

export const PERSONAL_LUNAR_SNAPSHOT_VERSION = "1.0.0";

export interface PersonalLunarSnapshot {
  input: TransitSnapshotInput;
  moon: CelestialPosition;
  phase: LunarPhaseResult;
  natalAspects: readonly TransitAspect[];
  provenance: Readonly<{
    personalLunarVersion: string;
    lunarPhaseEngineVersion: string;
    derivedAt: string;
    currentSkyProvider: TransitSnapshot["sky"]["metadata"];
    transitEngineVersion: string;
    transitCalculatedAt: string;
    aspectPolicy: TransitSnapshot["metadata"]["aspectPolicy"];
    natal: Readonly<{
      input: NatalChartInput;
      metadata: NatalChartMetadata;
    }>;
  }>;
}

/**
 * Derives personal lunar facts from one already validated transit snapshot.
 * It performs no provider request and does not recalculate natal positions.
 */
export function derivePersonalLunarSnapshot(
  transitSnapshot: TransitSnapshot,
): PersonalLunarSnapshot {
  validateTransitSnapshot(transitSnapshot);
  const sun = findUniquePosition(transitSnapshot, "sun");
  const moon = findUniquePosition(transitSnapshot, "moon");

  return {
    input: transitSnapshot.input,
    moon,
    phase: deriveLunarPhase(
      sun.eclipticLongitudeDegrees,
      moon.eclipticLongitudeDegrees,
    ),
    natalAspects: transitSnapshot.aspects.filter(
      (aspect) => aspect.transitingBody === "moon",
    ),
    provenance: {
      personalLunarVersion: PERSONAL_LUNAR_SNAPSHOT_VERSION,
      lunarPhaseEngineVersion: LUNAR_PHASE_ENGINE_VERSION,
      derivedAt: new Date().toISOString(),
      currentSkyProvider: transitSnapshot.sky.metadata,
      transitEngineVersion: transitSnapshot.metadata.transitEngineVersion,
      transitCalculatedAt: transitSnapshot.metadata.calculatedAt,
      aspectPolicy: transitSnapshot.metadata.aspectPolicy,
      natal: transitSnapshot.natal,
    },
  };
}

function validateTransitSnapshot(transitSnapshot: TransitSnapshot): void {
  if (
    transitSnapshot.sky.instant !== transitSnapshot.input.instant ||
    transitSnapshot.sky.metadata.zodiacReference !== "tropical" ||
    transitSnapshot.sky.metadata.coordinateOrigin !==
      transitSnapshot.input.coordinateOrigin
  ) {
    throw new RangeError("Transit snapshot provenance is inconsistent");
  }
}

function findUniquePosition(
  transitSnapshot: TransitSnapshot,
  body: "sun" | "moon",
): CelestialPosition {
  const matches = transitSnapshot.sky.positions.filter(
    (position) => position.body === body,
  );
  if (matches.length !== 1) {
    throw new RangeError(`Transit snapshot must contain one ${body} position`);
  }
  return matches[0]!;
}
