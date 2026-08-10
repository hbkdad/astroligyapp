import { describe, expect, it } from "vitest";

import {
  NatalChartEngine,
  type NatalChartInput,
} from "@/application/calculate-natal-chart";
import {
  TransitSnapshotEngine,
  type TransitSnapshotInput,
} from "@/application/calculate-transit-snapshot";
import {
  composePersonalContext,
  PERSONAL_CONTEXT_FACTS_VERSION,
  type NumerologyContext,
} from "@/application/compose-personal-context";
import { derivePersonalLunarSnapshot } from "@/application/derive-personal-lunar-snapshot";
import {
  type EphemerisProvider,
  type HouseRequest,
  type PositionRequest,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { CONTEXT_NUMEROLOGY_KEYS } from "@/domain/context/contracts";
import { PythagoreanNumerology } from "@/domain/numerology/pythagorean";

const NATAL_INSTANT = "1990-07-15T12:00:00Z";
const CURRENT_INSTANT = "2000-01-01T02:00:00Z";
const NATAL_INPUT: NatalChartInput = {
  instant: NATAL_INSTANT,
  timezone: "America/Toronto",
  timezoneSource: "fixture IANA timezone",
  observer: { latitudeDegrees: 43.6532, longitudeDegrees: -79.3832 },
  coordinateSource: "fixture natal observer",
  coordinateOrigin: "topocentric",
  houseSystem: "whole-sign",
};
const TRANSIT_INPUT: TransitSnapshotInput = {
  instant: CURRENT_INSTANT,
  coordinateOrigin: "geocentric",
};

class ContextFixtureProvider implements EphemerisProvider {
  readonly id = "context-fixture";

  async getPositions(request: PositionRequest) {
    const offset = request.instant === NATAL_INSTANT ? 0 : 10;
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        positions: request.bodies.map((body, index) => ({
          body,
          eclipticLongitudeDegrees: (index * 36 + offset) % 360,
          speedLongitudeDegreesPerDay: index + 0.5,
        })),
        metadata: metadata(this.id, request, request.coordinateOrigin),
      },
    };
  }

  async getHouseCusps(request: HouseRequest) {
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        cuspsLongitudeDegrees: [
          300, 330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270,
        ],
        ascendantLongitudeDegrees: 300,
        midheavenLongitudeDegrees: 240,
        metadata: metadata(this.id, request, "topocentric"),
      },
    };
  }
}

describe("composePersonalContext", () => {
  it("composes an immutable, versioned fact aggregate with stable IDs", async () => {
    const components = await calculateComponents();
    const numerology = numerologyContext("1999-12-31");
    const context = composePersonalContext(
      components.natal,
      components.transits,
      components.lunar,
      numerology,
    );

    expect(context).toMatchObject({
      effectiveAt: CURRENT_INSTANT,
      localDate: "1999-12-31",
      timezone: "America/Toronto",
      metadata: {
        contextVersion: PERSONAL_CONTEXT_FACTS_VERSION,
        numerologyStrategy: { id: "pythagorean", version: "1.0.0" },
      },
    });
    expect(context.facts).toEqual(
      expect.arrayContaining([
        { id: "natal:placement:sun", kind: "natal-placement" },
        { id: "lunar:phase:waxing-crescent", kind: "lunar-phase" },
        { id: "numerology:personal-day", kind: "numerology" },
      ]),
    );
    expect(new Set(context.facts.map((fact) => fact.id)).size).toBe(
      context.facts.length,
    );
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.natal.placements)).toBe(true);
    expect(Object.isFrozen(context.numerology.results["personal-day"])).toBe(
      true,
    );
    expect(components.natal).not.toBe(context.natal);
  });

  it("produces the same ordered fact IDs from equal deterministic inputs", async () => {
    const first = await calculateComponents();
    const second = await calculateComponents();
    const firstContext = composePersonalContext(
      first.natal,
      first.transits,
      first.lunar,
      numerologyContext("1999-12-31"),
    );
    const secondContext = composePersonalContext(
      second.natal,
      second.transits,
      second.lunar,
      numerologyContext("1999-12-31"),
    );
    expect(secondContext.facts).toEqual(firstContext.facts);
  });

  it("rejects transit and lunar components from another calculation", async () => {
    const components = await calculateComponents();
    const wrongNatal = {
      ...components.natal,
      input: { ...components.natal.input, instant: "1991-01-01T00:00:00Z" },
    };
    expect(() =>
      composePersonalContext(
        wrongNatal,
        components.transits,
        components.lunar,
        numerologyContext("1999-12-31"),
      ),
    ).toThrow("does not reference the natal chart");

    const wrongLunar = {
      ...components.lunar,
      phase: { ...components.lunar.phase, phaseAngleDegrees: 123 },
    };
    expect(() =>
      composePersonalContext(
        components.natal,
        components.transits,
        wrongLunar,
        numerologyContext("1999-12-31"),
      ),
    ).toThrow("Personal lunar snapshot is inconsistent");
  });

  it("enforces the natal timezone date at the UTC day boundary", async () => {
    const components = await calculateComponents();
    expect(() =>
      composePersonalContext(
        components.natal,
        components.transits,
        components.lunar,
        numerologyContext("2000-01-01"),
      ),
    ).toThrow("Numerology effective date");
  });

  it("rejects duplicate fact identifiers from a malformed component", async () => {
    const components = await calculateComponents();
    const nonLunarAspect = components.transits.aspects.find(
      (aspect) => aspect.transitingBody !== "moon",
    )!;
    const duplicatedTransits = {
      ...components.transits,
      aspects: [...components.transits.aspects, nonLunarAspect],
    };
    expect(() =>
      composePersonalContext(
        components.natal,
        duplicatedTransits,
        components.lunar,
        numerologyContext("1999-12-31"),
      ),
    ).toThrow("fact identifiers must be unique");
  });

  it("rejects incomplete, invalid, or mixed-version numerology results", async () => {
    const components = await calculateComponents();
    const incomplete = numerologyContext("1999-12-31");
    delete (incomplete.results as Partial<MutableNumerologyResults>)[
      "personal-day"
    ];
    expect(() =>
      composePersonalContext(
        components.natal,
        components.transits,
        components.lunar,
        incomplete,
      ),
    ).toThrow("every required result");

    const mixed = numerologyContext("1999-12-31");
    (mixed.results as MutableNumerologyResults)["personal-day"] = {
      ...mixed.results["personal-day"],
      strategyVersion: "2.0.0",
    };
    expect(() =>
      composePersonalContext(
        components.natal,
        components.transits,
        components.lunar,
        mixed,
      ),
    ).toThrow("one strategy version");

    const invalid = numerologyContext("1999-12-31");
    (invalid.results as MutableNumerologyResults)["life-path"] = {
      ...invalid.results["life-path"],
      trace: [],
    };
    expect(() =>
      composePersonalContext(
        components.natal,
        components.transits,
        components.lunar,
        invalid,
      ),
    ).toThrow("life-path is invalid");
  });
});

type MutableNumerologyResults = {
  -readonly [
    Key in keyof NumerologyContext["results"]
  ]: NumerologyContext["results"][Key];
};

async function calculateComponents() {
  const provider = new ContextFixtureProvider();
  const natal = await new NatalChartEngine(provider).calculate(NATAL_INPUT);
  if (!natal.ok) throw new Error("Natal fixture failed");
  const transits = await new TransitSnapshotEngine(provider).calculate(
    natal.value,
    TRANSIT_INPUT,
  );
  if (!transits.ok) throw new Error("Transit fixture failed");
  return {
    natal: natal.value,
    transits: transits.value,
    lunar: derivePersonalLunarSnapshot(transits.value),
  };
}

function numerologyContext(effectiveDate: string): NumerologyContext {
  const strategy = new PythagoreanNumerology();
  const birthDate = "1990-07-15";
  const name = "Pythagoras";
  const results: NumerologyContext["results"] = {
    "life-path": strategy.calculateLifePath(birthDate),
    expression: strategy.calculateExpression(name),
    "soul-urge": strategy.calculateSoulUrge(name),
    personality: strategy.calculatePersonality(name),
    birthday: strategy.calculateBirthday(birthDate),
    maturity: strategy.calculateMaturity(birthDate, name),
    "personal-year": strategy.calculatePersonalYear(birthDate, 1999),
    "personal-month": strategy.calculatePersonalMonth(birthDate, 1999, 12),
    "personal-day": strategy.calculatePersonalDay(birthDate, effectiveDate),
  };
  expect(Object.keys(results).sort()).toEqual(
    [...CONTEXT_NUMEROLOGY_KEYS].sort(),
  );
  return { effectiveDate, results };
}

function metadata(
  providerId: string,
  request: Pick<PositionRequest | HouseRequest, "zodiacReference">,
  coordinateOrigin: "geocentric" | "topocentric",
): ProviderMetadata {
  return {
    providerId,
    providerVersion: "fixture-1.0.0",
    dataVersion: "fixture-data-1.0.0",
    calculatedAt: CURRENT_INSTANT,
    timeScale: "utc",
    referenceFrame: "ecliptic-of-date",
    zodiacReference: request.zodiacReference,
    coordinateOrigin,
  };
}
