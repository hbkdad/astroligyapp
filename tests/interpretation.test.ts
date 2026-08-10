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
  type PersonalContextFacts,
  type NumerologyContext,
} from "@/application/compose-personal-context";
import { derivePersonalLunarSnapshot } from "@/application/derive-personal-lunar-snapshot";
import {
  INTERPRETATION_PROJECTION_VERSION,
  prepareInterpretationRenderData,
  projectInterpretationKeys,
} from "@/application/project-interpretations";
import {
  type EphemerisProvider,
  type HouseRequest,
  type PositionRequest,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import {
  DEFAULT_INTERPRETATION_LIBRARY,
  DeterministicInterpretationLibrary,
} from "@/domain/interpretation/library";
import type {
  InterpretationLibrary,
  InterpretationTemplate,
} from "@/domain/interpretation/contracts";
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

class InterpretationFixtureProvider implements EphemerisProvider {
  readonly id = "interpretation-fixture";

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

describe("interpretation projection", () => {
  it("maps every immutable context fact exactly once without changing values", async () => {
    const context = await contextFixture();
    const projections = projectInterpretationKeys(context);
    expect(projections.map((item) => item.sourceFactId)).toEqual(
      context.facts.map((fact) => fact.id),
    );
    expect(new Set(projections.map((item) => item.key)).size).toBe(
      projections.length,
    );
    expect(projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "natal.sun.aries.house-3",
          templateKey: "natal-placement",
          parameters: expect.objectContaining({
            body: "sun",
            sign: "aries",
            degreeWithinSign: 0,
            houseNumber: 3,
          }),
        }),
        expect.objectContaining({
          key: "lunar.waxing-crescent.taurus",
          templateKey: "lunar-phase",
          parameters: expect.objectContaining({ phaseAngleDegrees: 36 }),
        }),
        expect.objectContaining({
          key: "numerology.personal-day.3",
          sourceFactId: "numerology:personal-day",
        }),
      ]),
    );
    expect(Object.isFrozen(projections)).toBe(true);
    expect(Object.isFrozen(projections[0]!.parameters)).toBe(true);
  });

  it("prepares structured template data without rendering prose", async () => {
    const context = await contextFixture();
    const result = prepareInterpretationRenderData(
      context,
      DEFAULT_INTERPRETATION_LIBRARY,
    );
    expect(result.unsupportedKeys).toEqual([]);
    expect(result.metadata).toMatchObject({
      projectionVersion: INTERPRETATION_PROJECTION_VERSION,
      contextVersion: context.metadata.contextVersion,
      libraryId: "personal-reflection-en-ca",
      libraryVersion: "1.1.0",
      locale: "en-CA",
    });
    expect(result.items.every((item) => item.resolution.supported)).toBe(true);
    expect(Object.keys(result.items[0]!)).toEqual(["projection", "resolution"]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns explicit unsupported-key results for an incomplete library", async () => {
    const context = await contextFixture();
    const library = new DeterministicInterpretationLibrary({
      id: "empty-fixture",
      version: "1.0.0",
      locale: "en-CA",
      templates: [],
    });
    const result = prepareInterpretationRenderData(context, library);
    expect(result.unsupportedKeys).toEqual(
      projectInterpretationKeys(context).map((item) => item.key),
    );
    expect(result.items[0]!.resolution).toEqual({
      supported: false,
      templateKey: result.items[0]!.projection.templateKey,
      reason: "unsupported-key",
    });
  });

  it("rejects unsafe or mismatched responses from a custom library", async () => {
    const context = await contextFixture();
    const unsafeLibrary: InterpretationLibrary = {
      id: "unsafe-fixture",
      version: "1.0.0",
      locale: "en-CA",
      resolve: () => ({
        supported: true,
        template: template({
          interpretationTemplate:
            "Within astrology traditions, you will buy this investment.",
        }),
      }),
    };
    expect(() =>
      prepareInterpretationRenderData(context, unsafeLibrary),
    ).toThrow("unsafe claim");

    const mismatchedLibrary: InterpretationLibrary = {
      ...unsafeLibrary,
      id: "mismatched-fixture",
      resolve: () => ({
        supported: true,
        template: template(),
      }),
    };
    expect(() =>
      prepareInterpretationRenderData(context, mismatchedLibrary),
    ).toThrow("mismatched template");

    const invalidFailureLibrary: InterpretationLibrary = {
      ...unsafeLibrary,
      id: "invalid-failure-fixture",
      resolve: () => ({
        supported: false,
        templateKey: "wrong-template",
        reason: "unsupported-key",
      }),
    };
    expect(() =>
      prepareInterpretationRenderData(context, invalidFailureLibrary),
    ).toThrow("invalid failure");
  });

  it.each([
    "Within astrology traditions, this will definitely happen.",
    "Within astrology traditions, you should make a medical decision because of this.",
    "Within astrology traditions, you will be cured.",
    "Within astrology traditions, buy this investment.",
    "Within astrology traditions, take legal action.",
    "Within astrology traditions, ignore a safety warning.",
    "Within astrology traditions, leave your partner.",
    "Within astrology traditions, your relationship will fail.",
  ])("rejects unsafe directive or deterministic claim: %s", (unsafeText) => {
    expect(() =>
      libraryWith(template({ interpretationTemplate: unsafeText })),
    ).toThrow("unsafe claim");
  });

  it("separates facts from framed interpretation and validates placeholders", () => {
    expect(() =>
      libraryWith(template({ factTemplate: "{body} means success." })),
    ).toThrow("interpretive language");
    expect(() =>
      libraryWith(
        template({
          interpretationTemplate: "This is a reflection prompt.",
        }),
      ),
    ).toThrow("tradition framing");
    expect(() =>
      libraryWith(template({ factTemplate: "{unknown} is present." })),
    ).toThrow("Invalid fact template text");
    expect(() =>
      libraryWith(
        template({
          parameters: ["body", "sign"],
          factTemplate: "{body} is present.",
        }),
      ),
    ).toThrow("every declared parameter");
    expect(() => libraryWith(template({ parameters: ["Bad-name"] }))).toThrow(
      "Invalid template parameter",
    );
    expect(
      () =>
        new DeterministicInterpretationLibrary({
          id: "",
          version: "1.0.0",
          locale: "en-CA",
          templates: [],
        }),
    ).toThrow("Library ID");
  });

  it("rejects missing fact coverage and duplicate projected keys", async () => {
    const context = await contextFixture();
    const missingFact = structuredClone(context) as MutableContext;
    missingFact.facts = missingFact.facts.slice(1);
    expect(() => projectInterpretationKeys(missingFact)).toThrow(
      "cover every context fact",
    );

    const duplicate = structuredClone(context) as MutableContext;
    duplicate.natal.placements[1] = duplicate.natal.placements[0]!;
    duplicate.facts[1] = duplicate.facts[0]!;
    expect(() => projectInterpretationKeys(duplicate)).toThrow(
      "projection keys must be unique",
    );
  });
});

type MutableContext = {
  -readonly [
    Key in keyof PersonalContextFacts
  ]: PersonalContextFacts[Key] extends readonly (infer Item)[]
    ? Item[]
    : PersonalContextFacts[Key];
} & {
  natal: PersonalContextFacts["natal"] & {
    placements: PersonalContextFacts["natal"]["placements"][number][];
  };
};

function template(
  override: Partial<InterpretationTemplate> = {},
): InterpretationTemplate {
  return {
    key: "natal-placement",
    tradition: "astrology",
    parameters: ["body"],
    factTemplate: "{body} is present.",
    interpretationTemplate:
      "Within astrology traditions, this is used as a reflection prompt for {body}.",
    ...override,
  };
}

function libraryWith(templateValue: InterpretationTemplate) {
  return new DeterministicInterpretationLibrary({
    id: "claim-safety-fixture",
    version: "1.0.0",
    locale: "en-CA",
    templates: [templateValue],
  });
}

async function contextFixture() {
  const provider = new InterpretationFixtureProvider();
  const natal = await new NatalChartEngine(provider).calculate(NATAL_INPUT);
  if (!natal.ok) throw new Error("Natal fixture failed");
  const transits = await new TransitSnapshotEngine(provider).calculate(
    natal.value,
    TRANSIT_INPUT,
  );
  if (!transits.ok) throw new Error("Transit fixture failed");
  const lunar = derivePersonalLunarSnapshot(transits.value);
  return composePersonalContext(
    natal.value,
    transits.value,
    lunar,
    numerologyContext(),
  );
}

function numerologyContext(): NumerologyContext {
  const strategy = new PythagoreanNumerology();
  const birthDate = "1990-07-15";
  const name = "Pythagoras";
  return {
    effectiveDate: "1999-12-31",
    results: {
      "life-path": strategy.calculateLifePath(birthDate),
      expression: strategy.calculateExpression(name),
      "soul-urge": strategy.calculateSoulUrge(name),
      personality: strategy.calculatePersonality(name),
      birthday: strategy.calculateBirthday(birthDate),
      maturity: strategy.calculateMaturity(birthDate, name),
      "personal-year": strategy.calculatePersonalYear(birthDate, 1999),
      "personal-month": strategy.calculatePersonalMonth(birthDate, 1999, 12),
      "personal-day": strategy.calculatePersonalDay(birthDate, "1999-12-31"),
    },
  };
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
