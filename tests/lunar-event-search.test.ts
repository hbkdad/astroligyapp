import { describe, expect, it, vi } from "vitest";

import {
  LUNAR_EVENT_SEARCH_VERSION,
  LunarEventSearch,
  PRIMARY_LUNAR_PHASES,
  type LunarEventSearchInput,
  type PrimaryLunarPhase,
} from "@/application/search-lunar-events";
import {
  type EphemerisProvider,
  type PositionRequest,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import { ZODIAC_SIGNS, type ZodiacSign } from "@/domain/astro/zodiac";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import sourceFixture from "./fixtures/ephemeris/usno-primary-phases-2000.json";

const START = "2000-01-01T00:00:00Z";
const DAY_MILLISECONDS = 86_400_000;

class LinearLunarProvider implements EphemerisProvider {
  readonly id = "linear-lunar-fixture";
  dispatches = 0;
  fail = false;
  inconsistentTrace = false;

  constructor(
    private readonly moonAtDay: (day: number) => number,
    private readonly sunAtDay: (day: number) => number = () => 0,
  ) {}

  async getPositions(request: PositionRequest) {
    this.dispatches += 1;
    if (this.fail) {
      return {
        ok: false as const,
        error: {
          code: "provider-unavailable" as const,
          message: "Linear lunar fixture unavailable",
          retryable: true,
        },
      };
    }
    const day =
      (Date.parse(request.instant) - Date.parse(START)) / DAY_MILLISECONDS;
    return {
      ok: true as const,
      value: {
        instant: request.instant,
        positions: request.bodies.map((body) => ({
          body,
          eclipticLongitudeDegrees: normalize(
            body === "moon" ? this.moonAtDay(day) : this.sunAtDay(day),
          ),
        })),
        metadata: metadata(
          request,
          this.inconsistentTrace && this.dispatches > 1
            ? "fixture-2.0.0"
            : "fixture-1.0.0",
        ),
      },
    };
  }

  async getHouseCusps() {
    return {
      ok: false as const,
      error: {
        code: "unsupported-capability" as const,
        message: "Houses are outside the lunar fixture",
        retryable: false,
      },
    };
  }
}

describe("LunarEventSearch", () => {
  it.each(ZODIAC_SIGNS)(
    "refines the Moon ingress into %s across its exact boundary",
    async (enteredSign) => {
      const boundary = ZODIAC_SIGNS.indexOf(enteredSign) * 30;
      const provider = new LinearLunarProvider((day) => boundary - 2.25 + day);
      const result = await new LunarEventSearch(provider).search(
        ingressInput(enteredSign),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        secondsFromDay(result.value.event.point.instant, 2.25),
      ).toBeLessThanOrEqual(1);
      expect(result.value.event).toMatchObject({
        type: "moon-sign-ingress",
        enteredSign,
        boundaryLongitudeDegrees: boundary,
        moonZodiac: {
          sign: enteredSign,
          signIndex: ZODIAC_SIGNS.indexOf(enteredSign),
        },
      });
      expect(result.value.event.point.angularErrorDegrees).toBeLessThan(
        0.00002,
      );
    },
  );

  it.each(PRIMARY_LUNAR_PHASES)(
    "refines the exact %s Moon-minus-Sun anchor",
    async (phase) => {
      const anchor = phaseAnchor(phase);
      const provider = new LinearLunarProvider(
        (day) => 40 + day + anchor - 3.3 + 12 * day,
        (day) => 40 + day,
      );
      const result = await new LunarEventSearch(provider).search(
        phaseInput(phase, instantAtDay(1)),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        secondsFromDay(result.value.event.point.instant, 0.275),
      ).toBeLessThanOrEqual(1);
      expect(result.value.event).toMatchObject({
        type: "primary-phase",
        phase,
        phaseAnchorDegrees: anchor,
        geometry: { phase, phaseAnchorDegrees: anchor },
      });
      expect(result.value.event.point.angularErrorDegrees).toBeLessThan(0.0002);
    },
  );

  it("retains provider/search traces and freezes the result", async () => {
    const provider = new LinearLunarProvider((day) => 27.75 + day);
    const result = await new LunarEventSearch(provider).search(
      ingressInput("taurus"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metadata).toMatchObject({
      searchEngineVersion: LUNAR_EVENT_SEARCH_VERSION,
      provider: {
        providerId: "linear-lunar-fixture",
        providerVersion: "fixture-1.0.0",
        dataVersion: "linear-lunar-data-1.0.0",
      },
      searchPolicy: {
        sampleStepSeconds: 86_400,
        refinementToleranceSeconds: 1,
        initialSampleCount: 6,
      },
    });
    expect(result.value.metadata.searchPolicy.evaluationCount).toBe(
      result.value.metadata.evaluations.length,
    );
    expect(result.value.metadata.evaluations.length).toBeGreaterThan(6);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.metadata.evaluations)).toBe(true);
  });

  it.each(sourceFixture.events)(
    "matches USNO API v4.0.1 $phase timing through the real adapter",
    async (fixture) => {
      const expected = Date.parse(fixture.expectedInstant);
      const result = await new LunarEventSearch(
        new AstronomyEngineProvider(),
      ).search({
        eventType: "primary-phase",
        phase: fixture.phase as PrimaryLunarPhase,
        startInstant: new Date(expected - 2 * DAY_MILLISECONDS).toISOString(),
        endInstant: new Date(expected + 2 * DAY_MILLISECONDS).toISOString(),
        coordinateOrigin: "geocentric",
        sampleStepSeconds: 21_600,
        refinementToleranceSeconds: 1,
        maxRefinementIterations: 32,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        Math.abs(Date.parse(result.value.event.point.instant) - expected) /
          1_000,
      ).toBeLessThanOrEqual(sourceFixture.toleranceSeconds);
      expect(result.value.metadata.provider).toMatchObject({
        providerId: "astronomy-engine",
        providerVersion: "2.1.19",
        coordinateOrigin: "geocentric",
      });
    },
  );

  it("supports explicit topocentric ingress provenance", async () => {
    const provider = new LinearLunarProvider((day) => 27.75 + day);
    const result = await new LunarEventSearch(provider).search({
      ...ingressInput("taurus"),
      coordinateOrigin: "topocentric",
      observer: { latitudeDegrees: 47.33, longitudeDegrees: 8.58 },
      coordinateSource: "published Zollikon fixture coordinates",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.input).toMatchObject({
      coordinateOrigin: "topocentric",
      coordinateSource: "published Zollikon fixture coordinates",
    });
  });

  it("rejects invalid inputs before provider dispatch", async () => {
    const provider = new LinearLunarProvider((day) => 27.75 + day);
    const dispatch = vi.spyOn(provider, "getPositions");
    const invalidInputs = [
      { ...ingressInput("taurus"), endInstant: START },
      { ...ingressInput("taurus"), startInstant: "2000-02-30T00:00:00Z" },
      { ...ingressInput("taurus"), sampleStepSeconds: 59 },
      { ...ingressInput("taurus"), sampleStepSeconds: 86_401 },
      { ...ingressInput("taurus"), refinementToleranceSeconds: 86_400 },
      { ...ingressInput("taurus"), maxRefinementIterations: 0 },
      {
        ...ingressInput("taurus"),
        coordinateOrigin: "topocentric" as const,
      },
      {
        ...ingressInput("taurus"),
        enteredSign: "unknown",
      } as unknown as LunarEventSearchInput,
      {
        ...phaseInput("new-moon", instantAtDay(1)),
        phase: "crescent",
      } as unknown as LunarEventSearchInput,
    ];
    for (const input of invalidInputs)
      await expect(
        new LunarEventSearch(provider).search(input),
      ).rejects.toThrow(RangeError);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not report a reverse crossing as the requested ingress", async () => {
    const provider = new LinearLunarProvider((day) => 32 - day);
    const result = await new LunarEventSearch(provider).search(
      ingressInput("taurus"),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "event-not-bracketed", retryable: false },
    });
  });

  it("requires samples on both sides of an exact event", async () => {
    const provider = new LinearLunarProvider((day) => 30 + day);
    const result = await new LunarEventSearch(provider).search(
      ingressInput("taurus"),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "event-not-bracketed", retryable: false },
    });
  });

  it("rejects a sample jump that skips the requested entered sign", async () => {
    const provider = new LinearLunarProvider((day) => 29 + 32 * day);
    const result = await new LunarEventSearch(provider).search({
      ...ingressInput("taurus"),
      endInstant: instantAtDay(2),
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "event-not-bracketed", retryable: false },
    });
  });

  it("rejects intervals with multiple matching lunar events", async () => {
    const provider = new LinearLunarProvider((day) => -180 + 72 * day);
    const result = await new LunarEventSearch(provider).search({
      ...phaseInput("new-moon", instantAtDay(10)),
      sampleStepSeconds: 21_600,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "ambiguous-event", retryable: false },
    });
  });

  it("propagates provider failures without partial event output", async () => {
    const provider = new LinearLunarProvider((day) => 27.75 + day);
    provider.fail = true;
    await expect(
      new LunarEventSearch(provider).search(ingressInput("taurus")),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "provider-unavailable",
        message: "Linear lunar fixture unavailable",
        retryable: true,
      },
    });
  });

  it("fails when provider trace changes during the search", async () => {
    const provider = new LinearLunarProvider((day) => 27.75 + day);
    provider.inconsistentTrace = true;
    const result = await new LunarEventSearch(provider).search(
      ingressInput("taurus"),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "inconsistent-provider-trace", retryable: false },
    });
  });

  it("fails instead of returning a time outside declared precision", async () => {
    const provider = new LinearLunarProvider((day) => 27.7 + day);
    const result = await new LunarEventSearch(provider).search({
      ...ingressInput("taurus"),
      maxRefinementIterations: 2,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "insufficient-precision", retryable: false },
    });
  });
});

function ingressInput(enteredSign: ZodiacSign): LunarEventSearchInput {
  return {
    eventType: "moon-sign-ingress",
    enteredSign,
    startInstant: START,
    endInstant: instantAtDay(5),
    coordinateOrigin: "geocentric",
    sampleStepSeconds: 86_400,
    refinementToleranceSeconds: 1,
    maxRefinementIterations: 32,
  };
}

function phaseInput(
  phase: PrimaryLunarPhase,
  endInstant: string,
): LunarEventSearchInput {
  return {
    eventType: "primary-phase",
    phase,
    startInstant: START,
    endInstant,
    coordinateOrigin: "geocentric",
    sampleStepSeconds: 21_600,
    refinementToleranceSeconds: 1,
    maxRefinementIterations: 32,
  };
}

function phaseAnchor(phase: PrimaryLunarPhase): number {
  return {
    "new-moon": 0,
    "first-quarter": 90,
    "full-moon": 180,
    "third-quarter": 270,
  }[phase];
}

function metadata(
  request: PositionRequest,
  providerVersion: string,
): ProviderMetadata {
  return {
    providerId: "linear-lunar-fixture",
    providerVersion,
    dataVersion: "linear-lunar-data-1.0.0",
    calculatedAt: request.instant,
    timeScale: "utc",
    referenceFrame: "ecliptic-of-date",
    zodiacReference: request.zodiacReference,
    coordinateOrigin: request.coordinateOrigin,
  };
}

function instantAtDay(day: number): string {
  return new Date(Date.parse(START) + day * DAY_MILLISECONDS).toISOString();
}

function secondsFromDay(instant: string, day: number): number {
  return (
    Math.abs(
      Date.parse(instant) - (Date.parse(START) + day * DAY_MILLISECONDS),
    ) / 1_000
  );
}

function normalize(value: number): number {
  return ((value % 360) + 360) % 360;
}
