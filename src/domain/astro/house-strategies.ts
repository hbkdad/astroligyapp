import { normalizeLongitude } from "./zodiac";

export const WHOLE_SIGN_HOUSE_SYSTEM = "whole-sign";
export const WHOLE_SIGN_STRATEGY_VERSION = "1.0.0";

export interface HouseAngles {
  ascendantLongitudeDegrees: number;
  midheavenLongitudeDegrees: number;
}

export interface HouseStrategy {
  readonly id: string;
  readonly version: string;
  calculateCusps(angles: HouseAngles): readonly number[];
}

export class WholeSignHouseStrategy implements HouseStrategy {
  readonly id = WHOLE_SIGN_HOUSE_SYSTEM;
  readonly version = WHOLE_SIGN_STRATEGY_VERSION;

  calculateCusps(angles: HouseAngles): readonly number[] {
    const firstHouseLongitude =
      Math.floor(normalizeLongitude(angles.ascendantLongitudeDegrees) / 30) *
      30;

    return Array.from({ length: 12 }, (_, index) =>
      normalizeLongitude(firstHouseLongitude + index * 30),
    );
  }
}

export function findHouseNumber(
  longitudeDegrees: number,
  cuspsLongitudeDegrees: readonly number[],
): number {
  if (cuspsLongitudeDegrees.length !== 12) {
    throw new RangeError("Exactly 12 house cusps are required");
  }

  const firstCusp = normalizeLongitude(cuspsLongitudeDegrees[0]!);
  const offsets = cuspsLongitudeDegrees.map((cusp) =>
    normalizeLongitude(cusp - firstCusp),
  );
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index]! <= offsets[index - 1]!) {
      throw new RangeError("House cusps must advance in zodiac order");
    }
  }

  const longitudeOffset = normalizeLongitude(longitudeDegrees - firstCusp);
  let houseNumber = 1;
  for (let index = 1; index < offsets.length; index += 1) {
    if (longitudeOffset < offsets[index]!) break;
    houseNumber = index + 1;
  }
  return houseNumber;
}
