import {
  normalizeLongitude,
  toZodiacPosition,
  type ZodiacPosition,
} from "@/domain/astro/zodiac";

export const LUNAR_PHASES = [
  "new-moon",
  "waxing-crescent",
  "first-quarter",
  "waxing-gibbous",
  "full-moon",
  "waning-gibbous",
  "third-quarter",
  "waning-crescent",
] as const;

export type LunarPhase = (typeof LUNAR_PHASES)[number];
export type IlluminationTrend = "waxing" | "waning" | "turning";

export const MEAN_SYNODIC_MONTH_DAYS = 29.53059;

export interface LunarPhaseResult {
  phase: LunarPhase;
  phaseAngleDegrees: number;
  phaseAnchorDegrees: number;
  approximateIlluminatedFraction: number;
  estimatedAgeDays: number;
  cycleProgress: number;
  illuminationTrend: IlluminationTrend;
  moonZodiac: ZodiacPosition;
}

/**
 * Derives lunar phase geometry from validated apparent ecliptic longitudes.
 * Illumination and age are geometric/mean-cycle estimates, not event times.
 */
export function deriveLunarPhase(
  sunLongitudeDegrees: number,
  moonLongitudeDegrees: number,
): LunarPhaseResult {
  const phaseAngleDegrees = normalizeLongitude(
    moonLongitudeDegrees - sunLongitudeDegrees,
  );
  const phaseIndex = Math.floor((phaseAngleDegrees + 22.5) / 45) % 8;
  const angleRadians = (phaseAngleDegrees * Math.PI) / 180;

  return {
    phase: LUNAR_PHASES[phaseIndex]!,
    phaseAngleDegrees,
    phaseAnchorDegrees: phaseIndex * 45,
    approximateIlluminatedFraction: (1 - Math.cos(angleRadians)) / 2,
    estimatedAgeDays: (phaseAngleDegrees / 360) * MEAN_SYNODIC_MONTH_DAYS,
    cycleProgress: phaseAngleDegrees / 360,
    illuminationTrend:
      phaseAngleDegrees === 0 || phaseAngleDegrees === 180
        ? "turning"
        : phaseAngleDegrees < 180
          ? "waxing"
          : "waning",
    moonZodiac: toZodiacPosition(moonLongitudeDegrees),
  };
}
