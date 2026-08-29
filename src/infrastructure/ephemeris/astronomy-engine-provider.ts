import {
  AstroTime,
  Body,
  Ecliptic,
  GeoVector,
  Observer,
  ObserverVector,
  RotateVector,
  Rotation_ECT_EQJ,
  Rotation_EQJ_HOR,
  Vector,
} from "astronomy-engine";

import {
  type CelestialBody,
  type CelestialPosition,
  type EphemerisProvider,
  type EphemerisProviderResult,
  type HouseRequest,
  type HouseResult,
  type ObserverLocation,
  type PositionRequest,
  type PositionResult,
} from "@/domain/astro/contracts";
import {
  type HouseAngles,
  type HouseStrategy,
  WholeSignHouseStrategy,
  WHOLE_SIGN_HOUSE_SYSTEM,
} from "@/domain/astro/house-strategies";

export const ASTRONOMY_ENGINE_PROVIDER_ID = "astronomy-engine";
export const ASTRONOMY_ENGINE_PROVIDER_VERSION = "2.1.19";
export const ASTRONOMY_ENGINE_POSITION_DATA_VERSION = `astronomy-engine-model-${ASTRONOMY_ENGINE_PROVIDER_VERSION}`;
const SPEED_STEP_DAYS = 1 / 1440;

const BODY_MAP: Readonly<Record<CelestialBody, Body>> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

export class AstronomyEngineProvider implements EphemerisProvider {
  readonly id = ASTRONOMY_ENGINE_PROVIDER_ID;

  constructor(
    private readonly houseStrategy: HouseStrategy = new WholeSignHouseStrategy(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getPositions(
    request: PositionRequest,
  ): Promise<EphemerisProviderResult<PositionResult>> {
    if (request.zodiacReference !== "tropical") {
      return unsupported("Sidereal positions are not supported");
    }

    try {
      const date = new Date(request.instant);
      const positions = request.bodies.map((body) =>
        calculatePosition(
          body,
          date,
          request.coordinateOrigin,
          request.observer,
        ),
      );
      return {
        ok: true,
        value: {
          instant: request.instant,
          positions,
          metadata: {
            providerId: this.id,
            providerVersion: ASTRONOMY_ENGINE_PROVIDER_VERSION,
            dataVersion: ASTRONOMY_ENGINE_POSITION_DATA_VERSION,
            calculatedAt: this.now().toISOString(),
            timeScale: "utc",
            referenceFrame: "ecliptic-of-date",
            zodiacReference: request.zodiacReference,
            coordinateOrigin: request.coordinateOrigin,
          },
        },
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "data-unavailable",
          message:
            "Astronomy Engine could not calculate the requested positions",
          retryable: false,
        },
      };
    }
  }

  async getHouseCusps(
    request: HouseRequest,
  ): Promise<EphemerisProviderResult<HouseResult>> {
    if (request.zodiacReference !== "tropical") {
      return unsupported("Sidereal houses are not supported");
    }
    if (
      request.houseSystem !== WHOLE_SIGN_HOUSE_SYSTEM ||
      this.houseStrategy.id !== WHOLE_SIGN_HOUSE_SYSTEM
    ) {
      return unsupported(
        `House system ${request.houseSystem} is not supported`,
      );
    }
    if (Math.abs(request.observer.latitudeDegrees) === 90) {
      return {
        ok: false,
        error: {
          code: "data-unavailable",
          message: "House angles are undefined at the geographic poles",
          retryable: false,
        },
      };
    }

    try {
      const angles = calculateHouseAngles(
        new Date(request.instant),
        request.observer,
      );
      return {
        ok: true,
        value: {
          instant: request.instant,
          cuspsLongitudeDegrees: this.houseStrategy.calculateCusps(angles),
          ...angles,
          metadata: {
            providerId: this.id,
            providerVersion: ASTRONOMY_ENGINE_PROVIDER_VERSION,
            dataVersion: `${ASTRONOMY_ENGINE_POSITION_DATA_VERSION}+${this.houseStrategy.id}-${this.houseStrategy.version}`,
            calculatedAt: this.now().toISOString(),
            timeScale: "utc",
            referenceFrame: "ecliptic-of-date",
            zodiacReference: request.zodiacReference,
            coordinateOrigin: "topocentric",
          },
        },
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "data-unavailable",
          message: "Astronomy Engine could not calculate the house angles",
          retryable: false,
        },
      };
    }
  }
}

function calculateHouseAngles(
  date: Date,
  location: ObserverLocation,
): HouseAngles {
  const time = new AstroTime(date);
  const observer = new Observer(
    location.latitudeDegrees,
    location.longitudeDegrees,
    location.elevationMeters ?? 0,
  );
  const toEquatorial = Rotation_ECT_EQJ(time);
  const toHorizontal = Rotation_EQJ_HOR(time, observer);

  const horizontalVector = (longitudeDegrees: number): Vector => {
    const radians = (longitudeDegrees * Math.PI) / 180;
    const ecliptic = new Vector(Math.cos(radians), Math.sin(radians), 0, time);
    return RotateVector(toHorizontal, RotateVector(toEquatorial, ecliptic));
  };

  const horizonRoots = componentRoots(horizontalVector, "z");
  const meridianRoots = componentRoots(horizontalVector, "y");
  const ascendant = horizonRoots.find(
    (longitude) => horizontalVector(longitude).y < 0,
  );
  const midheaven = meridianRoots.find(
    (longitude) => horizontalVector(longitude).z > 0,
  );
  if (ascendant === undefined || midheaven === undefined) {
    throw new RangeError("House angles are geometrically undefined");
  }

  return {
    ascendantLongitudeDegrees: normalizeLongitude(ascendant),
    midheavenLongitudeDegrees: normalizeLongitude(midheaven),
  };
}

function componentRoots(
  horizontalVector: (longitudeDegrees: number) => Vector,
  component: "y" | "z",
): readonly [number, number] {
  const cosineCoefficient = horizontalVector(0)[component];
  const sineCoefficient = horizontalVector(90)[component];
  if (Math.hypot(cosineCoefficient, sineCoefficient) < 1e-12) {
    throw new RangeError("Ecliptic intersection is undefined");
  }
  const first = normalizeLongitude(
    (Math.atan2(-cosineCoefficient, sineCoefficient) * 180) / Math.PI,
  );
  return [first, normalizeLongitude(first + 180)];
}

function calculatePosition(
  body: CelestialBody,
  date: Date,
  origin: "geocentric" | "topocentric",
  observer?: ObserverLocation,
): CelestialPosition {
  const current = calculateCoordinates(body, date, origin, observer);
  const nextDate = new Date(date.getTime() + SPEED_STEP_DAYS * 86_400_000);
  const next = calculateCoordinates(body, nextDate, origin, observer);
  return {
    body,
    eclipticLongitudeDegrees: current.longitude,
    eclipticLatitudeDegrees: current.latitude,
    speedLongitudeDegreesPerDay:
      signedCircularDifference(current.longitude, next.longitude) /
      SPEED_STEP_DAYS,
  };
}

function calculateCoordinates(
  body: CelestialBody,
  date: Date,
  origin: "geocentric" | "topocentric",
  location?: ObserverLocation,
): { longitude: number; latitude: number } {
  const vector = GeoVector(BODY_MAP[body], date, true);
  const adjusted =
    origin === "topocentric" && location
      ? subtractObserver(vector, location)
      : vector;
  const ecliptic = Ecliptic(adjusted);
  return {
    longitude: normalizeLongitude(ecliptic.elon),
    latitude: ecliptic.elat,
  };
}

function subtractObserver(vector: Vector, location: ObserverLocation): Vector {
  const observer = new Observer(
    location.latitudeDegrees,
    location.longitudeDegrees,
    location.elevationMeters ?? 0,
  );
  const offset = ObserverVector(vector.t, observer, false);
  return new Vector(
    vector.x - offset.x,
    vector.y - offset.y,
    vector.z - offset.z,
    new AstroTime(vector.t),
  );
}

function normalizeLongitude(value: number): number {
  return ((value % 360) + 360) % 360;
}

function signedCircularDifference(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function unsupported<T>(message: string): EphemerisProviderResult<T> {
  return {
    ok: false,
    error: { code: "unsupported-capability", message, retryable: false },
  };
}
