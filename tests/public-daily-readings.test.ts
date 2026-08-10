import { describe, expect, it } from "vitest";

import {
  PUBLIC_DAILY_PROJECTION_VERSION,
  PUBLIC_DAILY_READING_VERSION,
  PUBLIC_DAILY_SKY_SAMPLE_CONVENTION,
  PUBLIC_SIGN_TARGET_CONVENTION,
  PublicDailyReadingEngine,
} from "@/application/compose-public-daily-readings";
import { UNSUPPORTED_INTERPRETATION_FALLBACK } from "@/application/render-interpretations";
import {
  CELESTIAL_BODIES,
  type EphemerisProvider,
  type PositionRequest,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { ZODIAC_SIGNS } from "@/domain/astro/zodiac";
import type { InterpretationLibrary } from "@/domain/interpretation/contracts";
import { DeterministicInterpretationLibrary } from "@/domain/interpretation/library";
import {
  PUBLIC_INTERPRETATION_LIBRARY_ID,
  PUBLIC_INTERPRETATION_LIBRARY_VERSION,
} from "@/domain/interpretation/public-library";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";

const INPUT = {
  date: "2000-01-01",
} as const;
const EFFECTIVE_AT = "2000-01-01T12:00:00Z";

class PublicSkyFixtureProvider implements EphemerisProvider {
  readonly id = "public-sky-fixture";
  calls = 0;
  lastRequest?: PositionRequest;

  constructor(
    private readonly mode: "success" | "failure" | "malformed" = "success",
  ) {}

  async getPositions(request: PositionRequest) {
    this.calls += 1;
    this.lastRequest = structuredClone(request);
    if (this.mode === "failure") {
      return {
        ok: false as const,
        error: {
          code: "data-unavailable" as const,
          message: "Fixture sky unavailable",
          retryable: true,
        },
      };
    }
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        positions: request.bodies.map((body, index) => ({
          body,
          eclipticLongitudeDegrees:
            this.mode === "malformed" && index === 0 ? 360 : index * 36 + 15,
          speedLongitudeDegreesPerDay: index % 3 === 0 ? 0 : index + 0.25,
        })),
        metadata: metadata(this.id, request),
      },
    };
  }

  async getHouseCusps() {
    return {
      ok: false as const,
      error: {
        code: "unsupported-capability" as const,
        message: "Fixture does not calculate houses",
        retryable: false,
      },
    };
  }
}

describe("public daily reading aggregate", () => {
  it("builds one immutable, ordered reading for every tropical Sun sign", async () => {
    const provider = new PublicSkyFixtureProvider();
    const result = await new PublicDailyReadingEngine(provider).calculate(
      INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      version: PUBLIC_DAILY_READING_VERSION,
      date: INPUT.date,
      effectiveAt: EFFECTIVE_AT,
      dayTimezone: "UTC",
      metadata: {
        projectionVersion: PUBLIC_DAILY_PROJECTION_VERSION,
        lunarEngineVersion: "1.0.0",
        signTargetConvention: PUBLIC_SIGN_TARGET_CONVENTION,
        skySampleConvention: PUBLIC_DAILY_SKY_SAMPLE_CONVENTION,
        library: {
          id: PUBLIC_INTERPRETATION_LIBRARY_ID,
          version: PUBLIC_INTERPRETATION_LIBRARY_VERSION,
          locale: "en-CA",
        },
      },
    });
    expect(result.value.readings.map((reading) => reading.sunSign)).toEqual(
      ZODIAC_SIGNS,
    );
    expect(
      result.value.readings.map((reading) => reading.target.longitudeDegrees),
    ).toEqual(Array.from({ length: 12 }, (_, index) => index * 30 + 15));
    expect(
      new Set(result.value.readings.map((reading) => reading.id)).size,
    ).toBe(12);
    expect(
      result.value.readings.every((reading) => reading.facts.length > 0),
    ).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.sky.positions)).toBe(true);
    const firstFact = result.value.readings[0]!.facts[0]!;
    expect(firstFact.kind).toBe("shared-lunar-context");
    if (firstFact.kind !== "shared-lunar-context") return;
    expect(Object.isFrozen(firstFact.phase)).toBe(true);
  });

  it("uses one public geocentric tropical sky with complete provider provenance", async () => {
    const provider = new PublicSkyFixtureProvider();
    const result = await new PublicDailyReadingEngine(provider).calculate(
      INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(provider.calls).toBe(1);
    expect(provider.lastRequest).toEqual({
      instant: EFFECTIVE_AT,
      bodies: CELESTIAL_BODIES,
      zodiacReference: "tropical",
      coordinateOrigin: "geocentric",
    });
    expect(provider.lastRequest).not.toHaveProperty("observer");
    expect(result.value.sky.positions.map((position) => position.body)).toEqual(
      CELESTIAL_BODIES,
    );
    expect(result.value.sky.metadata).toMatchObject({
      providerId: provider.id,
      providerVersion: "fixture-1.0.0",
      dataVersion: "fixture-data-1.0.0",
      timeScale: "utc",
      referenceFrame: "ecliptic-of-date",
      zodiacReference: "tropical",
      coordinateOrigin: "geocentric",
    });
  });

  it("keeps astronomy facts separate from safe, general tradition-framed prompts", async () => {
    const result = await new PublicDailyReadingEngine(
      new PublicSkyFixtureProvider(),
    ).calculate(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const reading of result.value.readings) {
      expect(reading.rendered.items).toHaveLength(reading.facts.length);
      expect(
        reading.rendered.items.map((item) =>
          item.status === "rendered" ? item.fact.provenance.sourceFactId : "",
        ),
      ).toEqual(reading.facts.map((fact) => fact.id));
      for (const item of reading.rendered.items) {
        expect(item.status).toBe("rendered");
        if (item.status !== "rendered") continue;
        expect(item.tradition).toBe("astrology");
        expect(item.interpretation.text).toMatch(
          /^Within astrology traditions,/,
        );
        expect(item.interpretation.text).toMatch(/not (?:an )?individualized/);
        expect(item.fact.text).not.toMatch(
          /\b(?:means?|suggests?|indicates?|predicts?|lucky|unlucky|destined)\b/i,
        );
        expect(item.interpretation.text).not.toMatch(
          /\b(?:will|guaranteed|certainly|diagnose|cure|buy|sell|invest|lawsuit)\b/i,
        );
      }
    }
  });

  it("reuses identical shared lunar geometry under sign-scoped stable fact IDs", async () => {
    const result = await new PublicDailyReadingEngine(
      new PublicSkyFixtureProvider(),
    ).calculate(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const lunarFacts = result.value.readings.map((reading) => {
      const fact = reading.facts[0]!;
      if (fact.kind !== "shared-lunar-context")
        throw new Error("Expected shared lunar fact first");
      return fact;
    });
    expect(new Set(lunarFacts.map((fact) => fact.id)).size).toBe(12);
    expect(lunarFacts.map((fact) => JSON.stringify(fact.phase))).toEqual(
      Array(12).fill(JSON.stringify(lunarFacts[0]!.phase)),
    );
    expect(lunarFacts[0]!.phase).toMatchObject({
      phaseAngleDegrees: 36,
      approximateIlluminatedFraction: 0.09549150281252627,
      moonZodiac: { sign: "taurus", degreeWithinSign: 21 },
    });
  });

  it("derives reproducible transit IDs and exact midpoint aspects", async () => {
    const result = await new PublicDailyReadingEngine(
      new PublicSkyFixtureProvider(),
    ).calculate(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const aries = result.value.readings[0]!;
    const sunTransit = aries.facts.find(
      (fact) =>
        fact.kind === "public-sun-sign-transit" &&
        fact.transitingBody === "sun",
    );
    expect(sunTransit).toEqual({
      id: "public-daily:2000-01-01:aries:transit:sun:conjunction",
      kind: "public-sun-sign-transit",
      transitingBody: "sun",
      aspect: {
        type: "conjunction",
        exactAngleDegrees: 0,
        actualAngleDegrees: 0,
        orbDegrees: 0,
        maximumOrbDegrees: 8,
        phase: "stationary",
        normalizedStrength: 1,
      },
    });
    expect(result.value.metadata.aspectPolicy).toMatchObject({
      id: "major-aspects",
      version: "1.0.0",
    });
  });

  it.each(["1999-12-31", "2000-02-29", "2000-03-01"])(
    "maps the valid plain-date boundary %s to exactly one UTC-noon identity",
    async (date) => {
      const result = await new PublicDailyReadingEngine(
        new PublicSkyFixtureProvider(),
      ).calculate({ date });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.effectiveAt).toBe(`${date}T12:00:00Z`);
      expect(
        result.value.readings.every((reading) =>
          reading.id.startsWith(`public-daily:${date}:`),
        ),
      ).toBe(true);
    },
  );

  it.each([
    null,
    {},
    { date: "2000-02-30" },
    { date: "2000-1-01" },
    { ...INPUT, effectiveAt: "2000-01-01T00:00:00Z" },
    { ...INPUT, birthDate: "1970-01-01" },
    { ...INPUT, birthTime: "12:34" },
    { ...INPUT, birthLocation: "private-place" },
    { ...INPUT, fullName: "private-name" },
    { ...INPUT, accountId: "private-account" },
    { ...INPUT, profileId: "private-profile" },
    { ...INPUT, observer: { latitudeDegrees: 1, longitudeDegrees: 2 } },
  ])(
    "rejects malformed or private input before provider dispatch: %j",
    async (input) => {
      const provider = new PublicSkyFixtureProvider();
      await expect(
        new PublicDailyReadingEngine(provider).calculate(input as never),
      ).rejects.toThrow("Invalid public daily reading input");
      expect(provider.calls).toBe(0);
    },
  );

  it("contains no private input fields, injected private values, scores, or predictions", async () => {
    const result = await new PublicDailyReadingEngine(
      new PublicSkyFixtureProvider(),
    ).calculate(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toMatch(
      /birthDate|birthTime|birthLocation|fullName|accountId|profileId|observer|relationshipProfile|private-secret-marker/i,
    );
    expect(serialized).not.toMatch(
      /scientificScore|influenceScore|prediction/i,
    );
  });

  it("preserves explicit provider failures and converts malformed responses", async () => {
    const unavailable = await new PublicDailyReadingEngine(
      new PublicSkyFixtureProvider("failure"),
    ).calculate(INPUT);
    expect(unavailable).toEqual({
      ok: false,
      error: {
        code: "data-unavailable",
        message: "Fixture sky unavailable",
        retryable: true,
      },
    });

    const malformed = await new PublicDailyReadingEngine(
      new PublicSkyFixtureProvider("malformed"),
    ).calculate(INPUT);
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: "invalid-provider-response", retryable: false },
    });
  });

  it("renders structured fallbacks when a versioned library lacks public templates", async () => {
    const emptyLibrary = new DeterministicInterpretationLibrary({
      id: "empty-public-fixture",
      version: "2.0.0",
      locale: "en-CA",
      templates: [],
    });
    const result = await new PublicDailyReadingEngine(
      new PublicSkyFixtureProvider(),
      emptyLibrary,
    ).calculate(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metadata.library).toEqual({
      id: "empty-public-fixture",
      version: "2.0.0",
      locale: "en-CA",
    });
    expect(
      result.value.readings.flatMap((reading) => reading.rendered.items),
    ).toSatisfy((items: { status: string; fallback?: { text: string } }[]) =>
      items.every(
        (item) =>
          item.status === "unsupported" &&
          item.fallback?.text === UNSUPPORTED_INTERPRETATION_FALLBACK,
      ),
    );
  });

  it("fails closed when library version metadata changes during composition", async () => {
    let versionReads = 0;
    const changingLibrary: InterpretationLibrary = {
      id: "changing-public-fixture",
      get version() {
        versionReads += 1;
        return versionReads === 1 ? "1.0.0" : "2.0.0";
      },
      locale: "en-CA",
      resolve: (templateKey) => ({
        supported: false,
        templateKey,
        reason: "unsupported-key",
      }),
    };
    await expect(
      new PublicDailyReadingEngine(
        new PublicSkyFixtureProvider(),
        changingLibrary,
      ).calculate(INPUT),
    ).rejects.toThrow("library metadata changed");
  });

  it("rejects unsafe claims returned by a custom public library", async () => {
    const unsafeLibrary: InterpretationLibrary = {
      id: "unsafe-public-fixture",
      version: "1.0.0",
      locale: "en-CA",
      resolve: (key) => ({
        supported: true,
        template: {
          key: key as "public-lunar-context",
          tradition: "astrology",
          parameters: [
            "date",
            "sunSign",
            "phase",
            "moonSign",
            "phaseAngleDegrees",
            "approximateIlluminatedFraction",
          ],
          factTemplate:
            "On {date}, {phase} and {moonSign} are supplied at {phaseAngleDegrees} for {sunSign} with {approximateIlluminatedFraction}.",
          interpretationTemplate:
            "Within astrology traditions, this will definitely happen.",
        },
      }),
    };
    await expect(
      new PublicDailyReadingEngine(
        new PublicSkyFixtureProvider(),
        unsafeLibrary,
      ).calculate(INPUT),
    ).rejects.toThrow("unsafe claim");
  });

  it("accepts the selected Astronomy Engine adapter without provider-specific domain coupling", async () => {
    const result = await new PublicDailyReadingEngine(
      new AstronomyEngineProvider(),
    ).calculate(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.readings).toHaveLength(12);
    expect(result.value.sky.metadata).toMatchObject({
      providerId: "astronomy-engine",
      providerVersion: "2.1.19",
      zodiacReference: "tropical",
      coordinateOrigin: "geocentric",
    });
  });
});

function metadata(
  providerId: string,
  request: PositionRequest,
): ProviderMetadata {
  return {
    providerId,
    providerVersion: "fixture-1.0.0",
    dataVersion: "fixture-data-1.0.0",
    calculatedAt: request.instant,
    timeScale: "utc",
    referenceFrame: "ecliptic-of-date",
    zodiacReference: request.zodiacReference,
    coordinateOrigin: request.coordinateOrigin,
  };
}
