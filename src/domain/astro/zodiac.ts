export const ZODIAC_SIGNS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

export interface ZodiacPosition {
  longitudeDegrees: number;
  signIndex: number;
  sign: ZodiacSign;
  degreeWithinSign: number;
}

export function normalizeLongitude(longitudeDegrees: number): number {
  if (!Number.isFinite(longitudeDegrees)) {
    throw new RangeError("Longitude must be a finite number");
  }

  const normalized = ((longitudeDegrees % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function toZodiacPosition(longitudeDegrees: number): ZodiacPosition {
  const normalized = normalizeLongitude(longitudeDegrees);
  const signIndex = Math.floor(normalized / 30);

  return {
    longitudeDegrees: normalized,
    signIndex,
    sign: ZODIAC_SIGNS[signIndex]!,
    degreeWithinSign: normalized - signIndex * 30,
  };
}
