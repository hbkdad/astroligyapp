import {
  AstroTime,
  Body,
  Ecliptic,
  GeoVector,
  Observer,
  ObserverVector,
  Vector,
} from "astronomy-engine";

import {
  type CelestialBody,
  type CelestialPosition,
  type EphemerisProvider,
  type EphemerisProviderResult,
  type HouseResult,
  type ObserverLocation,
  type PositionRequest,
  type PositionResult,
} from "@/domain/astro/contracts";

const PACKAGE_VERSION = "2.1.19";
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
  readonly id = "astronomy-engine";

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
            providerVersion: PACKAGE_VERSION,
            dataVersion: `astronomy-engine-model-${PACKAGE_VERSION}`,
            calculatedAt: new Date().toISOString(),
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

  async getHouseCusps(): Promise<EphemerisProviderResult<HouseResult>> {
    return unsupported("Astrological house cusps are not supported");
  }
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
