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
