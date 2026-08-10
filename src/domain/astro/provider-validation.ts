import {
  CELESTIAL_BODIES,
  type CelestialBody,
  type CelestialPosition,
  type EphemerisProvider,
  type EphemerisProviderError,
  type EphemerisProviderErrorCode,
  type EphemerisProviderResult,
  type HouseRequest,
  type HouseResult,
  type ObserverLocation,
  type PositionRequest,
  type PositionResult,
  type ProviderMetadata,
} from "./contracts";

const ERROR_CODES = new Set<EphemerisProviderErrorCode>([
  "invalid-request",
  "unsupported-capability",
  "data-unavailable",
  "provider-unavailable",
  "invalid-provider-response",
]);
const BODY_SET = new Set<string>(CELESTIAL_BODIES);

export class EphemerisContractViolation extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "EphemerisContractViolation";
  }
}

export function validatePositionRequest(request: PositionRequest): void {
  validateUtcInstant(request.instant, "request.instant");
  if (request.bodies.length === 0) {
    violation("request.bodies", "at least one body is required");
  }
  const seen = new Set<string>();
  request.bodies.forEach((body, index) => {
    if (!BODY_SET.has(body)) {
      violation(`request.bodies[${index}]`, "unsupported body");
    }
    if (seen.has(body)) {
      violation(`request.bodies[${index}]`, "duplicate body");
    }
    seen.add(body);
  });
  if (!(["tropical", "sidereal"] as const).includes(request.zodiacReference)) {
    violation("request.zodiacReference", "unsupported zodiac reference");
  }
  if (
    !(["geocentric", "topocentric"] as const).includes(request.coordinateOrigin)
  ) {
    violation("request.coordinateOrigin", "unsupported coordinate origin");
  }
  if (request.observer) validateObserver(request.observer, "request.observer");
  if (request.coordinateOrigin === "topocentric" && !request.observer) {
    violation("request.observer", "topocentric requests require an observer");
  }
}

export function validateHouseRequest(request: HouseRequest): void {
  validateUtcInstant(request.instant, "request.instant");
  validateObserver(request.observer, "request.observer");
  if (!request.houseSystem.trim() || request.houseSystem.length > 32) {
    violation("request.houseSystem", "must contain 1 to 32 characters");
  }
  if (!(["tropical", "sidereal"] as const).includes(request.zodiacReference)) {
    violation("request.zodiacReference", "unsupported zodiac reference");
  }
}

export function validatePositionResult(
  providerId: string,
  request: PositionRequest,
  result: PositionResult,
): void {
  assertOnlyKeys(result, ["instant", "positions", "metadata"], "result");
  if (result.instant !== request.instant) {
    violation("result.instant", "must exactly match the requested instant");
  }
  const expected = new Set<CelestialBody>(request.bodies);
  const seen = new Set<CelestialBody>();
  result.positions.forEach((position, index) => {
    validatePosition(position, `result.positions[${index}]`);
    if (!expected.has(position.body)) {
      violation(`result.positions[${index}].body`, "body was not requested");
    }
    if (seen.has(position.body)) {
      violation(`result.positions[${index}].body`, "duplicate body");
    }
    seen.add(position.body);
  });
  for (const body of expected) {
    if (!seen.has(body)) {
      violation("result.positions", `missing requested body ${body}`);
    }
  }
  validateMetadata(providerId, request, result.metadata);
}

export function validateHouseResult(
  providerId: string,
  request: HouseRequest,
  result: HouseResult,
): void {
  assertOnlyKeys(
    result,
    [
      "instant",
      "cuspsLongitudeDegrees",
      "ascendantLongitudeDegrees",
      "midheavenLongitudeDegrees",
      "metadata",
    ],
    "result",
  );
  if (result.instant !== request.instant) {
    violation("result.instant", "must exactly match the requested instant");
  }
  if (result.cuspsLongitudeDegrees.length !== 12) {
    violation("result.cuspsLongitudeDegrees", "exactly 12 cusps are required");
  }
  result.cuspsLongitudeDegrees.forEach((longitude, index) =>
    validateLongitude(longitude, `result.cuspsLongitudeDegrees[${index}]`),
  );
  validateLongitude(
    result.ascendantLongitudeDegrees,
    "result.ascendantLongitudeDegrees",
  );
  validateLongitude(
    result.midheavenLongitudeDegrees,
    "result.midheavenLongitudeDegrees",
  );
  validateMetadata(providerId, request, result.metadata, "topocentric");
}

export function validateProviderError(error: EphemerisProviderError): void {
  assertOnlyKeys(error, ["code", "message", "retryable"], "error");
  if (!ERROR_CODES.has(error.code)) {
    violation("error.code", "unsupported provider error code");
  }
  if (
    typeof error.message !== "string" ||
    !error.message.trim() ||
    error.message.length > 256 ||
    /[\r\n]/.test(error.message)
  ) {
    violation("error.message", "must be a single privacy-safe line");
  }
  if (typeof error.retryable !== "boolean") {
    violation("error.retryable", "must be boolean");
  }
  if (
    error.retryable &&
    [
      "invalid-request",
      "unsupported-capability",
      "invalid-provider-response",
    ].includes(error.code)
  ) {
    violation("error.retryable", `${error.code} cannot be retryable`);
  }
}

export async function getValidatedPositions(
  provider: EphemerisProvider,
  request: PositionRequest,
): Promise<EphemerisProviderResult<PositionResult>> {
  validatePositionRequest(request);
  let response: EphemerisProviderResult<PositionResult>;
  try {
    response = await provider.getPositions(request);
  } catch {
    return providerFailure("provider-unavailable", true);
  }
  try {
    if (!response.ok) {
      validateProviderError(response.error);
      return response;
    }
    validatePositionResult(provider.id, request, response.value);
    return response;
  } catch {
    return providerFailure("invalid-provider-response", false);
  }
}

export async function getValidatedHouseCusps(
  provider: EphemerisProvider,
  request: HouseRequest,
): Promise<EphemerisProviderResult<HouseResult>> {
  validateHouseRequest(request);
  let response: EphemerisProviderResult<HouseResult>;
  try {
    response = await provider.getHouseCusps(request);
  } catch {
    return providerFailure("provider-unavailable", true);
  }
  try {
    if (!response.ok) {
      validateProviderError(response.error);
      return response;
    }
    validateHouseResult(provider.id, request, response.value);
    return response;
  } catch {
    return providerFailure("invalid-provider-response", false);
  }
}

function validatePosition(position: CelestialPosition, path: string): void {
  assertOnlyKeys(
    position,
    [
      "body",
      "eclipticLongitudeDegrees",
      "eclipticLatitudeDegrees",
      "distanceAu",
      "speedLongitudeDegreesPerDay",
    ],
    path,
  );
  if (!BODY_SET.has(position.body))
    violation(`${path}.body`, "unsupported body");
  validateLongitude(
    position.eclipticLongitudeDegrees,
    `${path}.eclipticLongitudeDegrees`,
  );
  if (position.eclipticLatitudeDegrees !== undefined) {
    validateFiniteRange(
      position.eclipticLatitudeDegrees,
      -90,
      90,
      `${path}.eclipticLatitudeDegrees`,
    );
  }
  if (
    position.distanceAu !== undefined &&
    (!Number.isFinite(position.distanceAu) || position.distanceAu <= 0)
  ) {
    violation(`${path}.distanceAu`, "must be finite and positive");
  }
  if (
    position.speedLongitudeDegreesPerDay !== undefined &&
    !Number.isFinite(position.speedLongitudeDegreesPerDay)
  ) {
    violation(`${path}.speedLongitudeDegreesPerDay`, "must be finite");
  }
}

function validateMetadata(
  providerId: string,
  request: Pick<PositionRequest | HouseRequest, "instant" | "zodiacReference"> &
    Partial<Pick<PositionRequest, "coordinateOrigin">>,
  metadata: ProviderMetadata,
  expectedOrigin = request.coordinateOrigin,
): void {
  assertOnlyKeys(
    metadata,
    [
      "providerId",
      "providerVersion",
      "dataVersion",
      "calculatedAt",
      "timeScale",
      "referenceFrame",
      "zodiacReference",
      "coordinateOrigin",
    ],
    "result.metadata",
  );
  if (!providerId.trim() || metadata.providerId !== providerId) {
    violation("result.metadata.providerId", "must match the adapter ID");
  }
  for (const [key, value] of [
    ["providerVersion", metadata.providerVersion],
    ["dataVersion", metadata.dataVersion],
  ] as const) {
    if (!value.trim() || value.length > 128) {
      violation(`result.metadata.${key}`, "must contain 1 to 128 characters");
    }
  }
  validateUtcInstant(metadata.calculatedAt, "result.metadata.calculatedAt");
  if (metadata.timeScale !== "utc") {
    violation("result.metadata.timeScale", "must be utc");
  }
  if (metadata.referenceFrame !== "ecliptic-of-date") {
    violation("result.metadata.referenceFrame", "must be ecliptic-of-date");
  }
  if (metadata.zodiacReference !== request.zodiacReference) {
    violation("result.metadata.zodiacReference", "must match the request");
  }
  if (metadata.coordinateOrigin !== expectedOrigin) {
    violation("result.metadata.coordinateOrigin", "must match the request");
  }
}

function validateObserver(observer: ObserverLocation, path: string): void {
  validateFiniteRange(
    observer.latitudeDegrees,
    -90,
    90,
    `${path}.latitudeDegrees`,
  );
  validateFiniteRange(
    observer.longitudeDegrees,
    -180,
    180,
    `${path}.longitudeDegrees`,
  );
  if (
    observer.elevationMeters !== undefined &&
    !Number.isFinite(observer.elevationMeters)
  ) {
    violation(`${path}.elevationMeters`, "must be finite");
  }
}

function validateLongitude(value: number, path: string): void {
  validateFiniteRange(value, 0, 360, path, true);
}

function validateFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  path: string,
  excludeMaximum = false,
): void {
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    (excludeMaximum ? value >= maximum : value > maximum)
  ) {
    violation(
      path,
      `must be finite in [${minimum}, ${maximum}${excludeMaximum ? ")" : "]"}`,
    );
  }
}

function validateUtcInstant(value: string, path: string): void {
  const match =
    typeof value === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/.exec(
          value,
        )
      : null;
  if (!match) {
    violation(path, "must be a valid ISO 8601 UTC instant ending in Z");
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth =
    month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;
  if (
    year < 1 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    violation(path, "must be a valid ISO 8601 UTC instant ending in Z");
  }
}

function assertOnlyKeys(
  value: object,
  allowedKeys: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      violation(`${path}.${key}`, "undocumented provider-specific field");
    }
  }
}

function providerFailure(
  code: "provider-unavailable" | "invalid-provider-response",
  retryable: boolean,
): EphemerisProviderResult<never> {
  return {
    ok: false,
    error: {
      code,
      message:
        code === "provider-unavailable"
          ? "Ephemeris provider unavailable"
          : "Ephemeris provider returned an invalid response",
      retryable,
    },
  };
}

function violation(path: string, message: string): never {
  throw new EphemerisContractViolation(path, message);
}
