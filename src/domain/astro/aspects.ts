import { normalizeLongitude } from "./zodiac";

export const ASPECT_TYPES = [
  "conjunction",
  "sextile",
  "square",
  "trine",
  "opposition",
] as const;

export type AspectType = (typeof ASPECT_TYPES)[number];
export type AspectPhase = "applying" | "separating" | "stationary" | "unknown";

export interface AspectDefinition {
  type: AspectType;
  exactAngleDegrees: number;
  maximumOrbDegrees: number;
}

export const DEFAULT_ASPECT_DEFINITIONS: readonly AspectDefinition[] = [
  { type: "conjunction", exactAngleDegrees: 0, maximumOrbDegrees: 8 },
  { type: "sextile", exactAngleDegrees: 60, maximumOrbDegrees: 5 },
  { type: "square", exactAngleDegrees: 90, maximumOrbDegrees: 7 },
  { type: "trine", exactAngleDegrees: 120, maximumOrbDegrees: 7 },
  { type: "opposition", exactAngleDegrees: 180, maximumOrbDegrees: 8 },
];

export interface AspectMatch {
  type: AspectType;
  exactAngleDegrees: number;
  actualAngleDegrees: number;
  orbDegrees: number;
  maximumOrbDegrees: number;
  phase: AspectPhase;
  normalizedStrength: number;
}

export interface AspectMotion {
  firstSpeedDegreesPerDay: number;
  secondSpeedDegreesPerDay: number;
}

export function minimalAngularSeparation(
  firstLongitudeDegrees: number,
  secondLongitudeDegrees: number,
): number {
  const first = normalizeLongitude(firstLongitudeDegrees);
  const second = normalizeLongitude(secondLongitudeDegrees);
  const difference = Math.abs(first - second);
  return Math.min(difference, 360 - difference);
}

export function findClosestAspect(
  firstLongitudeDegrees: number,
  secondLongitudeDegrees: number,
  definitions: readonly AspectDefinition[] = DEFAULT_ASPECT_DEFINITIONS,
  motion?: AspectMotion,
): AspectMatch | null {
  validateDefinitions(definitions);
  const actualAngleDegrees = minimalAngularSeparation(
    firstLongitudeDegrees,
    secondLongitudeDegrees,
  );

  const candidates = definitions
    .map((definition) => ({
      definition,
      orbDegrees: Math.abs(actualAngleDegrees - definition.exactAngleDegrees),
    }))
    .filter(
      ({ definition, orbDegrees }) =>
        orbDegrees <= definition.maximumOrbDegrees,
    )
    .sort(
      (left, right) =>
        left.orbDegrees - right.orbDegrees ||
        left.definition.exactAngleDegrees - right.definition.exactAngleDegrees,
    );

  const closest = candidates[0];
  if (!closest) {
    return null;
  }

  const { definition, orbDegrees } = closest;
  return {
    type: definition.type,
    exactAngleDegrees: definition.exactAngleDegrees,
    actualAngleDegrees,
    orbDegrees,
    maximumOrbDegrees: definition.maximumOrbDegrees,
    phase: classifyPhase(
      firstLongitudeDegrees,
      secondLongitudeDegrees,
      definition.exactAngleDegrees,
      motion,
    ),
    normalizedStrength:
      definition.maximumOrbDegrees === 0
        ? 1
        : 1 - orbDegrees / definition.maximumOrbDegrees,
  };
}

function classifyPhase(
  firstLongitudeDegrees: number,
  secondLongitudeDegrees: number,
  exactAngleDegrees: number,
  motion?: AspectMotion,
): AspectPhase {
  if (
    !motion ||
    !Number.isFinite(motion.firstSpeedDegreesPerDay) ||
    !Number.isFinite(motion.secondSpeedDegreesPerDay)
  ) {
    return "unknown";
  }

  const relativeSpeed =
    motion.secondSpeedDegreesPerDay - motion.firstSpeedDegreesPerDay;
  if (relativeSpeed === 0) {
    return "stationary";
  }

  const currentOrb = Math.abs(
    minimalAngularSeparation(firstLongitudeDegrees, secondLongitudeDegrees) -
      exactAngleDegrees,
  );
  const futureOrb = Math.abs(
    minimalAngularSeparation(
      firstLongitudeDegrees + motion.firstSpeedDegreesPerDay / 10_000,
      secondLongitudeDegrees + motion.secondSpeedDegreesPerDay / 10_000,
    ) - exactAngleDegrees,
  );

  if (futureOrb === currentOrb) {
    return "stationary";
  }
  return futureOrb < currentOrb ? "applying" : "separating";
}

function validateDefinitions(definitions: readonly AspectDefinition[]): void {
  if (definitions.length === 0) {
    throw new RangeError("At least one aspect definition is required");
  }

  const types = new Set<AspectType>();
  for (const definition of definitions) {
    if (
      !ASPECT_TYPES.includes(definition.type) ||
      !Number.isFinite(definition.exactAngleDegrees) ||
      definition.exactAngleDegrees < 0 ||
      definition.exactAngleDegrees > 180 ||
      !Number.isFinite(definition.maximumOrbDegrees) ||
      definition.maximumOrbDegrees < 0 ||
      types.has(definition.type)
    ) {
      throw new RangeError("Invalid or duplicate aspect definition");
    }
    types.add(definition.type);
  }
}
