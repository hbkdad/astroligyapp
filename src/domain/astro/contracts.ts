export const CELESTIAL_BODIES = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
] as const;

export type CelestialBody = (typeof CELESTIAL_BODIES)[number];

export type EphemerisTimeScale = "utc";
export type EphemerisReferenceFrame = "ecliptic-of-date";
export type ZodiacReference = "tropical" | "sidereal";
export type CoordinateOrigin = "geocentric" | "topocentric";

export interface ObserverLocation {
  latitudeDegrees: number;
  longitudeDegrees: number;
  elevationMeters?: number;
}

export interface ProviderMetadata {
  providerId: string;
  providerVersion: string;
  dataVersion: string;
  calculatedAt: string;
  timeScale: EphemerisTimeScale;
  referenceFrame: EphemerisReferenceFrame;
  zodiacReference: ZodiacReference;
  coordinateOrigin: CoordinateOrigin;
}

export interface CelestialPosition {
  body: CelestialBody;
  eclipticLongitudeDegrees: number;
  eclipticLatitudeDegrees?: number;
  distanceAu?: number;
  speedLongitudeDegreesPerDay?: number;
}

export interface PositionRequest {
  /** ISO 8601 UTC instant. Validate before invoking a provider. */
  instant: string;
  bodies: readonly CelestialBody[];
  observer?: ObserverLocation;
  zodiacReference: ZodiacReference;
  coordinateOrigin: CoordinateOrigin;
}

export interface PositionResult {
  instant: string;
  positions: readonly CelestialPosition[];
  metadata: ProviderMetadata;
}

export interface HouseRequest {
  /** ISO 8601 UTC instant. Validate before invoking a provider. */
  instant: string;
  observer: ObserverLocation;
  houseSystem: string;
  zodiacReference: ZodiacReference;
}

export interface HouseResult {
  instant: string;
  cuspsLongitudeDegrees: readonly number[];
  ascendantLongitudeDegrees: number;
  midheavenLongitudeDegrees: number;
  metadata: ProviderMetadata;
}

export type EphemerisProviderErrorCode =
  | "invalid-request"
  | "unsupported-capability"
  | "data-unavailable"
  | "provider-unavailable"
  | "invalid-provider-response";

export interface EphemerisProviderError {
  code: EphemerisProviderErrorCode;
  message: string;
  retryable: boolean;
}

export type EphemerisProviderResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: EphemerisProviderError }>;

export interface EphemerisProvider {
  readonly id: string;
  getPositions(
    request: PositionRequest,
  ): Promise<EphemerisProviderResult<PositionResult>>;
  getHouseCusps(
    request: HouseRequest,
  ): Promise<EphemerisProviderResult<HouseResult>>;
}
