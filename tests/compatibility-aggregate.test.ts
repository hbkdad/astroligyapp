import { describe, expect, it } from "vitest";

import {
  calculateNatalAspects,
  type NatalChart,
} from "@/application/calculate-natal-chart";
import {
  HouseOverlayEngine,
  type HouseOverlayResult,
} from "@/application/calculate-house-overlays";
import {
  COMPATIBILITY_FACT_AGGREGATE_DISCLAIMER,
  COMPATIBILITY_FACT_AGGREGATE_VERSION,
  composeCompatibilityFacts,
  InvalidCompatibilityAggregateError,
  type CompatibilityFactAggregateInput,
} from "@/application/compose-compatibility-facts";
import {
  SynastryAspectEngine,
  type SynastryAspectResult,
} from "@/application/calculate-synastry-aspects";
import { findHouseNumber } from "@/domain/astro/house-strategies";
import { toZodiacPosition, type ZodiacSign } from "@/domain/astro/zodiac";
import { PhaseOneCompatibilityStrategy } from "@/domain/compatibility/phase-one";
import type { PhaseOneCompatibilityResult } from "@/domain/compatibility/contracts";
import type { NumerologyResult } from "@/domain/numerology/contracts";
import { ZOLLIKON_NATAL_CHART_DEMO } from "@/presentation/natal-chart-demo";

const FIRST_LONGITUDES = [0, 18, 37, 59, 83, 111, 147, 191, 239, 301];
const SECOND_LONGITUDES = [180, 198, 217, 239, 263, 291, 327, 11, 59, 121];

describe("validated compatibility fact aggregate", () => {
  it("composes exact version-matched facts into one immutable, score-free result", () => {
    const input = validInput();
    const aggregate = composeCompatibilityFacts(input);

    expect(aggregate).toMatchObject({
      version: COMPATIBILITY_FACT_AGGREGATE_VERSION,
      composer: {
        id: "compatibility-fact-composer",
        version: COMPATIBILITY_FACT_AGGREGATE_VERSION,
      },
      sunSignBindings: [
        { chart: "chart-a", sign: "aries" },
        { chart: "chart-b", sign: "libra" },
      ],
      factCounts: {
        phaseOneComparisons: 5,
        synastryAspects: input.synastry.aspects.length,
        houseOverlays: 20,
      },
      disclaimer: COMPATIBILITY_FACT_AGGREGATE_DISCLAIMER,
    });
    expect(aggregate.phaseOne).toEqual(input.phaseOne);
    expect(aggregate.synastry).toEqual(input.synastry);
    expect(aggregate.houseOverlays).toEqual(input.houseOverlays);
    expect(Object.isFrozen(aggregate)).toBe(true);
    expect(Object.isFrozen(aggregate.synastry.aspects)).toBe(true);
    expect(Object.isFrozen(aggregate.houseOverlays.overlays)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(JSON.stringify(aggregate)).not.toMatch(
      /birth|observer|timezone|coordinateSource|private-source-marker|categoryWeights|interpretation|overallScore/,
    );
  });

  it("is byte-equivalent when every relationship input reverses", () => {
    const first = chart("fixture-a", FIRST_LONGITUDES);
    const second = chart("fixture-b", SECOND_LONGITUDES);
    const forward = composeCompatibilityFacts(inputFor(first, second));
    const reversed = composeCompatibilityFacts(inputFor(second, first));

    expect(reversed).toEqual(forward);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it.each([
    [
      "phase trace loss",
      (input: CompatibilityFactAggregateInput) => {
        mutablePhase(input).trace.pop();
      },
    ],
    [
      "phase trace reorder",
      (input: CompatibilityFactAggregateInput) => {
        mutablePhase(input).trace.reverse();
      },
    ],
    [
      "synastry fact loss",
      (input: CompatibilityFactAggregateInput) => {
        mutableSynastry(input).aspects.pop();
      },
    ],
    [
      "synastry fact duplication",
      (input: CompatibilityFactAggregateInput) => {
        const result = mutableSynastry(input);
        result.aspects[1] = structuredClone(result.aspects[0]!);
      },
    ],
    [
      "synastry fact reorder",
      (input: CompatibilityFactAggregateInput) => {
        mutableSynastry(input).aspects.reverse();
      },
    ],
    [
      "overlay fact loss",
      (input: CompatibilityFactAggregateInput) => {
        mutableOverlays(input).overlays.pop();
      },
    ],
    [
      "overlay fact duplication",
      (input: CompatibilityFactAggregateInput) => {
        const result = mutableOverlays(input);
        result.overlays[1] = structuredClone(result.overlays[0]!);
      },
    ],
    [
      "overlay fact reorder",
      (input: CompatibilityFactAggregateInput) => {
        mutableOverlays(input).overlays.reverse();
      },
    ],
  ])("rejects %s generically", (_, corrupt) => {
    const input = structuredClone(validInput());
    corrupt(input);
    expect(() => composeCompatibilityFacts(input)).toThrow(
      InvalidCompatibilityAggregateError,
    );
    expect(() => composeCompatibilityFacts(input)).toThrow(
      "Compatibility fact aggregate input is invalid or inconsistent",
    );
  });

  it.each([
    [
      "phase version drift",
      (input: CompatibilityFactAggregateInput) => {
        mutablePhase(input).version = "2.0.0";
      },
    ],
    [
      "synastry version drift",
      (input: CompatibilityFactAggregateInput) => {
        mutableSynastry(input).version = "2.0.0";
      },
    ],
    [
      "overlay version drift",
      (input: CompatibilityFactAggregateInput) => {
        mutableOverlays(input).version = "2.0.0";
      },
    ],
    [
      "cross-result provider drift",
      (input: CompatibilityFactAggregateInput) => {
        mutableOverlays(input).charts[0]!.positionProvider.providerVersion =
          "drift";
      },
    ],
    [
      "cross-result placement drift",
      (input: CompatibilityFactAggregateInput) => {
        mutableOverlays(
          input,
        ).charts[0]!.placements[0]!.eclipticLongitudeDegrees = 1;
      },
    ],
    [
      "malformed aggregate claim",
      (input: CompatibilityFactAggregateInput) => {
        mutableSynastry(input).disclaimer = "Perfect match guaranteed";
      },
    ],
  ])("rejects %s", (_, corrupt) => {
    const input = structuredClone(validInput());
    corrupt(input);
    expect(() => composeCompatibilityFacts(input)).toThrow(
      InvalidCompatibilityAggregateError,
    );
  });

  it("rejects a phase-one sign pair that does not match the canonical Suns", () => {
    const input = structuredClone(validInput());
    (input as { phaseOne: PhaseOneCompatibilityResult }).phaseOne = phaseOne(
      "taurus",
      "libra",
    );
    expect(() => composeCompatibilityFacts(input)).toThrow(
      InvalidCompatibilityAggregateError,
    );
  });

  it("rejects unknown fields so raw private data cannot ride through the boundary", () => {
    const input = structuredClone(validInput());
    (input.synastry as unknown as Record<string, unknown>).birthDate =
      "1990-07-15";
    expect(() => composeCompatibilityFacts(input)).toThrow(
      InvalidCompatibilityAggregateError,
    );
  });
});

function validInput(): CompatibilityFactAggregateInput {
  return inputFor(
    chart("fixture-a", FIRST_LONGITUDES),
    chart("fixture-b", SECOND_LONGITUDES),
  );
}

function inputFor(
  first: NatalChart,
  second: NatalChart,
): CompatibilityFactAggregateInput {
  const signs = [first, second].map((candidate) =>
    toZodiacPosition(candidate.placements[0]!.eclipticLongitudeDegrees),
  );
  return {
    phaseOne: phaseOne(signs[0]!.sign, signs[1]!.sign),
    synastry: new SynastryAspectEngine().calculate(first, second),
    houseOverlays: new HouseOverlayEngine().calculate(first, second),
  };
}

function phaseOne(
  firstSign: ZodiacSign,
  secondSign: ZodiacSign,
): PhaseOneCompatibilityResult {
  return new PhaseOneCompatibilityStrategy().compare({
    first: {
      zodiacSign: firstSign,
      lifePath: numerology(11),
      expression: numerology(5),
    },
    second: {
      zodiacSign: secondSign,
      lifePath: numerology(7),
      expression: numerology(3),
    },
  });
}

function numerology(value: number): NumerologyResult {
  return {
    value,
    masterNumber: [11, 22, 33].includes(value),
    tokens: [{ source: "private-source-marker", normalized: "PRIVATE", value }],
    trace: [{ operation: "fixture-reduction", inputs: [value], result: value }],
    strategyId: "pythagorean",
    strategyVersion: "1.0.0",
  };
}

function chart(providerId: string, longitudes: readonly number[]): NatalChart {
  const result = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
  result.input.timezoneSource = "private aggregate timezone source";
  result.input.coordinateSource = "private aggregate coordinate source";
  result.metadata.positionProvider.providerId = providerId;
  result.metadata.positionProvider.providerVersion = "fixture-1.0.0";
  result.metadata.positionProvider.dataVersion = "fixture-data-1.0.0";
  result.placements = result.placements.map((placement, index) => {
    const longitude = longitudes[index]!;
    return {
      ...placement,
      eclipticLongitudeDegrees: longitude,
      speedLongitudeDegreesPerDay: index + 1,
      zodiac: toZodiacPosition(longitude),
      houseNumber: findHouseNumber(
        longitude,
        result.houses.cuspsLongitudeDegrees,
      ),
    };
  });
  result.aspects = calculateNatalAspects(
    result.placements,
    result.metadata.aspectPolicy.definitions,
  );
  return result;
}

function mutablePhase(input: CompatibilityFactAggregateInput) {
  return input.phaseOne as unknown as {
    version: string;
    trace: PhaseOneCompatibilityResult["trace"][number][];
  };
}

function mutableSynastry(input: CompatibilityFactAggregateInput) {
  return input.synastry as unknown as {
    version: string;
    disclaimer: string;
    aspects: SynastryAspectResult["aspects"][number][];
  };
}

function mutableOverlays(input: CompatibilityFactAggregateInput) {
  return input.houseOverlays as unknown as {
    version: string;
    charts: {
      positionProvider: { providerVersion: string };
      placements: { eclipticLongitudeDegrees: number }[];
    }[];
    overlays: HouseOverlayResult["overlays"][number][];
  };
}
