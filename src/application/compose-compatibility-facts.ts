import {
  HOUSE_OVERLAY_DISCLAIMER,
  HOUSE_OVERLAY_ENGINE_VERSION,
  type HouseOverlayChartSource,
  type HouseOverlayFact,
  type HouseOverlayResult,
} from "@/application/calculate-house-overlays";
import {
  SYNASTRY_ASPECT_DISCLAIMER,
  SYNASTRY_ASPECT_ENGINE_VERSION,
  type SynastryAspectFact,
  type SynastryAspectResult,
  type SynastryChartPlacementSource,
  type SynastryChartSide,
  type SynastryChartSource,
} from "@/application/calculate-synastry-aspects";
import {
  findClosestAspect,
  validateAspectDefinitions,
} from "@/domain/astro/aspects";
import {
  CELESTIAL_BODIES,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import {
  findHouseNumber,
  WHOLE_SIGN_HOUSE_SYSTEM,
  WHOLE_SIGN_STRATEGY_VERSION,
} from "@/domain/astro/house-strategies";
import { ZODIAC_SIGNS, toZodiacPosition } from "@/domain/astro/zodiac";
import type {
  CompatibilityPairFact,
  CompatibilityTraceStep,
  NumerologyPairFact,
  PhaseOneCompatibilityResult,
} from "@/domain/compatibility/contracts";
import { validatePhaseOneCompatibilityResult } from "@/domain/compatibility/phase-one";

export const COMPATIBILITY_FACT_AGGREGATE_VERSION = "1.0.0";
export const COMPATIBILITY_FACT_AGGREGATE_DISCLAIMER =
  "This aggregate contains deterministic comparison facts, not a compatibility score, relationship prediction, or advice.";

export interface CompatibilityFactAggregateInput {
  readonly phaseOne: PhaseOneCompatibilityResult;
  readonly synastry: SynastryAspectResult;
  readonly houseOverlays: HouseOverlayResult;
}

export interface CompatibilityFactAggregate {
  readonly version: string;
  readonly composer: Readonly<{ id: string; version: string }>;
  readonly sunSignBindings: readonly Readonly<{
    chart: SynastryChartSide;
    sign: (typeof ZODIAC_SIGNS)[number];
  }>[];
  readonly phaseOne: PhaseOneCompatibilityResult;
  readonly synastry: SynastryAspectResult;
  readonly houseOverlays: HouseOverlayResult;
  readonly factCounts: Readonly<{
    phaseOneComparisons: 5;
    synastryAspects: number;
    houseOverlays: 20;
  }>;
  readonly disclaimer: string;
}

export class InvalidCompatibilityAggregateError extends Error {
  constructor() {
    super("Compatibility fact aggregate input is invalid or inconsistent");
    this.name = "InvalidCompatibilityAggregateError";
  }
}

export function composeCompatibilityFacts(
  input: CompatibilityFactAggregateInput,
): CompatibilityFactAggregate {
  try {
    const phaseOne = projectPhaseOne(input.phaseOne);
    const synastry = projectSynastry(input.synastry);
    const houseOverlays = projectHouseOverlays(input.houseOverlays);
    requireExactShape(input.phaseOne, phaseOne);
    requireExactShape(input.synastry, synastry);
    requireExactShape(input.houseOverlays, houseOverlays);
    validatePhaseOneCompatibilityResult(phaseOne);
    validateSynastry(synastry);
    validateHouseOverlays(houseOverlays);
    validateSharedSources(synastry, houseOverlays);
    const sunSignBindings = bindSunSigns(phaseOne, synastry);

    return deepFreeze({
      version: COMPATIBILITY_FACT_AGGREGATE_VERSION,
      composer: {
        id: "compatibility-fact-composer",
        version: COMPATIBILITY_FACT_AGGREGATE_VERSION,
      },
      sunSignBindings,
      phaseOne,
      synastry,
      houseOverlays,
      factCounts: {
        phaseOneComparisons: 5,
        synastryAspects: synastry.aspects.length,
        houseOverlays: 20,
      },
      disclaimer: COMPATIBILITY_FACT_AGGREGATE_DISCLAIMER,
    });
  } catch {
    throw new InvalidCompatibilityAggregateError();
  }
}

function validateSynastry(result: SynastryAspectResult): void {
  if (
    result.version !== SYNASTRY_ASPECT_ENGINE_VERSION ||
    result.engine.id !== "deterministic-cross-chart-aspects" ||
    result.engine.version !== SYNASTRY_ASPECT_ENGINE_VERSION ||
    result.disclaimer !== SYNASTRY_ASPECT_DISCLAIMER
  )
    invalid();
  validateAspectDefinitions(result.aspectPolicy.definitions);
  if (
    !validText(result.aspectPolicy.id) ||
    !validText(result.aspectPolicy.version)
  )
    invalid();
  validateSynastrySource(result.charts[0], "chart-a");
  validateSynastrySource(result.charts[1], "chart-b");
  const firstKey = JSON.stringify(stripSynastrySide(result.charts[0]));
  const secondKey = JSON.stringify(stripSynastrySide(result.charts[1]));
  if (firstKey > secondKey) invalid();
  const expected = calculateExpectedSynastry(result);
  if (!sameValue(result.aspects, expected)) invalid();
}

function validateSynastrySource(
  source: SynastryChartSource,
  side: SynastryChartSide,
): void {
  if (
    source.side !== side ||
    source.chartEngineVersion !== "1.0.0" ||
    source.placements.length !== CELESTIAL_BODIES.length
  )
    invalid();
  validateProviderProjection(source.positionProvider);
  source.placements.forEach((placement, index) => {
    if (
      placement.body !== CELESTIAL_BODIES[index] ||
      !normalizedLongitude(placement.eclipticLongitudeDegrees) ||
      (placement.speedLongitudeDegreesPerDay !== undefined &&
        !Number.isFinite(placement.speedLongitudeDegreesPerDay))
    )
      invalid();
  });
}

function calculateExpectedSynastry(
  result: SynastryAspectResult,
): readonly SynastryAspectFact[] {
  const first = placementMap(result.charts[0].placements);
  const second = placementMap(result.charts[1].placements);
  const aspects: SynastryAspectFact[] = [];
  for (const firstBody of CELESTIAL_BODIES) {
    const firstPlacement = first.get(firstBody)!;
    for (const secondBody of CELESTIAL_BODIES) {
      const secondPlacement = second.get(secondBody)!;
      const match = findClosestAspect(
        firstPlacement.eclipticLongitudeDegrees,
        secondPlacement.eclipticLongitudeDegrees,
        result.aspectPolicy.definitions,
        firstPlacement.speedLongitudeDegreesPerDay !== undefined &&
          secondPlacement.speedLongitudeDegreesPerDay !== undefined
          ? {
              firstSpeedDegreesPerDay:
                firstPlacement.speedLongitudeDegreesPerDay,
              secondSpeedDegreesPerDay:
                secondPlacement.speedLongitudeDegreesPerDay,
            }
          : undefined,
      );
      if (!match) continue;
      aspects.push({
        id: `synastry:chart-a:${firstBody}:chart-b:${secondBody}:${match.type}`,
        first: { chart: "chart-a", body: firstBody },
        second: { chart: "chart-b", body: secondBody },
        ...match,
      });
    }
  }
  return aspects;
}

function validateHouseOverlays(result: HouseOverlayResult): void {
  if (
    result.version !== HOUSE_OVERLAY_ENGINE_VERSION ||
    result.engine.id !== "deterministic-cross-chart-house-overlays" ||
    result.engine.version !== HOUSE_OVERLAY_ENGINE_VERSION ||
    result.housePolicy.id !== WHOLE_SIGN_HOUSE_SYSTEM ||
    result.housePolicy.version !== WHOLE_SIGN_STRATEGY_VERSION ||
    result.disclaimer !== HOUSE_OVERLAY_DISCLAIMER
  )
    invalid();
  validateOverlaySource(result.charts[0], "chart-a");
  validateOverlaySource(result.charts[1], "chart-b");
  const expected = [
    ...expectedDirectionalOverlays(result.charts[0], result.charts[1]),
    ...expectedDirectionalOverlays(result.charts[1], result.charts[0]),
  ];
  if (!sameValue(result.overlays, expected)) invalid();
}

function validateOverlaySource(
  source: HouseOverlayChartSource,
  side: SynastryChartSide,
): void {
  if (
    source.side !== side ||
    source.chartEngineVersion !== "1.0.0" ||
    source.houseStrategy.id !== WHOLE_SIGN_HOUSE_SYSTEM ||
    source.houseStrategy.version !== WHOLE_SIGN_STRATEGY_VERSION ||
    source.placements.length !== CELESTIAL_BODIES.length ||
    source.cuspsLongitudeDegrees.length !== 12
  )
    invalid();
  validateProviderProjection(source.positionProvider);
  validateProviderProjection(source.houseProvider);
  source.placements.forEach((placement, index) => {
    if (
      placement.body !== CELESTIAL_BODIES[index] ||
      !normalizedLongitude(placement.eclipticLongitudeDegrees)
    )
      invalid();
  });
  if (source.cuspsLongitudeDegrees.some((value) => !normalizedLongitude(value)))
    invalid();
  for (const placement of source.placements)
    findHouseNumber(
      placement.eclipticLongitudeDegrees,
      source.cuspsLongitudeDegrees,
    );
}

function expectedDirectionalOverlays(
  sourceChart: HouseOverlayChartSource,
  targetChart: HouseOverlayChartSource,
): readonly HouseOverlayFact[] {
  return sourceChart.placements.map((placement) => {
    const houseNumber = findHouseNumber(
      placement.eclipticLongitudeDegrees,
      targetChart.cuspsLongitudeDegrees,
    );
    return {
      id: `house-overlay:${sourceChart.side}:${placement.body}:in:${targetChart.side}:house:${houseNumber}`,
      source: {
        chart: sourceChart.side,
        body: placement.body,
        eclipticLongitudeDegrees: placement.eclipticLongitudeDegrees,
      },
      target: {
        chart: targetChart.side,
        houseNumber,
        cuspLongitudeDegrees:
          targetChart.cuspsLongitudeDegrees[houseNumber - 1]!,
      },
    };
  });
}

function validateSharedSources(
  synastry: SynastryAspectResult,
  overlays: HouseOverlayResult,
): void {
  for (let index = 0; index < 2; index += 1) {
    const synastrySource = synastry.charts[index]!;
    const overlaySource = overlays.charts[index]!;
    if (
      synastrySource.side !== overlaySource.side ||
      synastrySource.chartEngineVersion !== overlaySource.chartEngineVersion ||
      !sameValue(
        synastrySource.positionProvider,
        overlaySource.positionProvider,
      ) ||
      !sameValue(
        synastrySource.placements.map((placement) => ({
          body: placement.body,
          eclipticLongitudeDegrees: placement.eclipticLongitudeDegrees,
        })),
        overlaySource.placements,
      )
    )
      invalid();
  }
}

function bindSunSigns(
  phaseOne: PhaseOneCompatibilityResult,
  synastry: SynastryAspectResult,
) {
  const bindings = synastry.charts.map((source) => ({
    chart: source.side,
    sign: toZodiacPosition(
      source.placements.find((placement) => placement.body === "sun")!
        .eclipticLongitudeDegrees,
    ).sign,
  }));
  const signs = bindings
    .map((binding) => binding.sign)
    .sort(
      (left, right) => ZODIAC_SIGNS.indexOf(left) - ZODIAC_SIGNS.indexOf(right),
    );
  if (!sameValue(signs, phaseOne.zodiac.signs.values)) invalid();
  return bindings;
}

function validateProviderProjection(
  metadata: Omit<ProviderMetadata, "calculatedAt">,
): void {
  if (
    !validText(metadata.providerId) ||
    !validText(metadata.providerVersion) ||
    !validText(metadata.dataVersion) ||
    metadata.timeScale !== "utc" ||
    metadata.referenceFrame !== "ecliptic-of-date" ||
    metadata.zodiacReference !== "tropical" ||
    !["geocentric", "topocentric"].includes(metadata.coordinateOrigin)
  )
    invalid();
}

function projectPhaseOne(
  source: PhaseOneCompatibilityResult,
): PhaseOneCompatibilityResult {
  return {
    version: source.version,
    strategy: { id: source.strategy.id, version: source.strategy.version },
    zodiacPolicy: {
      id: source.zodiacPolicy.id,
      version: source.zodiacPolicy.version,
    },
    numerologySource: {
      strategyId: source.numerologySource.strategyId,
      strategyVersion: source.numerologySource.strategyVersion,
    },
    zodiac: {
      signs: projectPair(source.zodiac.signs),
      elements: projectPair(source.zodiac.elements),
      modalities: projectPair(source.zodiac.modalities),
    },
    numerology: {
      lifePath: projectNumerologyPair(source.numerology.lifePath),
      expression: projectNumerologyPair(source.numerology.expression),
    },
    trace: source.trace.map(projectTrace),
    disclaimer: source.disclaimer,
  };
}

function projectPair<T extends string | number>(
  source: CompatibilityPairFact<T>,
): CompatibilityPairFact<T> {
  return { values: [source.values[0], source.values[1]], equal: source.equal };
}

function projectNumerologyPair(source: NumerologyPairFact): NumerologyPairFact {
  return {
    values: [source.values[0], source.values[1]],
    equal: source.equal,
    masterNumberCount: source.masterNumberCount,
  };
}

function projectTrace(source: CompatibilityTraceStep): CompatibilityTraceStep {
  return {
    operation: source.operation,
    inputs: [...source.inputs],
    result: source.result,
  };
}

function projectSynastry(source: SynastryAspectResult): SynastryAspectResult {
  return {
    version: source.version,
    engine: { id: source.engine.id, version: source.engine.version },
    aspectPolicy: {
      id: source.aspectPolicy.id,
      version: source.aspectPolicy.version,
      definitions: source.aspectPolicy.definitions.map((definition) => ({
        type: definition.type,
        exactAngleDegrees: definition.exactAngleDegrees,
        maximumOrbDegrees: definition.maximumOrbDegrees,
      })),
    },
    charts: [
      projectSynastrySource(source.charts[0]),
      projectSynastrySource(source.charts[1]),
    ],
    aspects: source.aspects.map(projectAspect),
    disclaimer: source.disclaimer,
  };
}

function projectSynastrySource(
  source: SynastryChartSource,
): SynastryChartSource {
  return {
    side: source.side,
    chartEngineVersion: source.chartEngineVersion,
    positionProvider: projectProvider(source.positionProvider),
    placements: source.placements.map((placement) => ({
      body: placement.body,
      eclipticLongitudeDegrees: placement.eclipticLongitudeDegrees,
      ...(placement.speedLongitudeDegreesPerDay !== undefined
        ? { speedLongitudeDegreesPerDay: placement.speedLongitudeDegreesPerDay }
        : {}),
    })),
  };
}

function projectAspect(source: SynastryAspectFact): SynastryAspectFact {
  return {
    id: source.id,
    first: { chart: source.first.chart, body: source.first.body },
    second: { chart: source.second.chart, body: source.second.body },
    type: source.type,
    exactAngleDegrees: source.exactAngleDegrees,
    actualAngleDegrees: source.actualAngleDegrees,
    orbDegrees: source.orbDegrees,
    maximumOrbDegrees: source.maximumOrbDegrees,
    phase: source.phase,
    normalizedStrength: source.normalizedStrength,
  };
}

function projectHouseOverlays(source: HouseOverlayResult): HouseOverlayResult {
  return {
    version: source.version,
    engine: { id: source.engine.id, version: source.engine.version },
    housePolicy: {
      id: source.housePolicy.id,
      version: source.housePolicy.version,
    },
    charts: [
      projectOverlaySource(source.charts[0]),
      projectOverlaySource(source.charts[1]),
    ],
    overlays: source.overlays.map((overlay) => ({
      id: overlay.id,
      source: {
        chart: overlay.source.chart,
        body: overlay.source.body,
        eclipticLongitudeDegrees: overlay.source.eclipticLongitudeDegrees,
      },
      target: {
        chart: overlay.target.chart,
        houseNumber: overlay.target.houseNumber,
        cuspLongitudeDegrees: overlay.target.cuspLongitudeDegrees,
      },
    })),
    disclaimer: source.disclaimer,
  };
}

function projectOverlaySource(
  source: HouseOverlayChartSource,
): HouseOverlayChartSource {
  return {
    side: source.side,
    chartEngineVersion: source.chartEngineVersion,
    positionProvider: projectProvider(source.positionProvider),
    houseProvider: projectProvider(source.houseProvider),
    houseStrategy: {
      id: source.houseStrategy.id,
      version: source.houseStrategy.version,
    },
    placements: source.placements.map((placement) => ({
      body: placement.body,
      eclipticLongitudeDegrees: placement.eclipticLongitudeDegrees,
    })),
    cuspsLongitudeDegrees: [...source.cuspsLongitudeDegrees],
  };
}

function projectProvider(
  metadata: Omit<ProviderMetadata, "calculatedAt">,
): Omit<ProviderMetadata, "calculatedAt"> {
  return {
    providerId: metadata.providerId,
    providerVersion: metadata.providerVersion,
    dataVersion: metadata.dataVersion,
    timeScale: metadata.timeScale,
    referenceFrame: metadata.referenceFrame,
    zodiacReference: metadata.zodiacReference,
    coordinateOrigin: metadata.coordinateOrigin,
  };
}

function stripSynastrySide(
  source: SynastryChartSource,
): Omit<SynastryChartSource, "side"> {
  return {
    chartEngineVersion: source.chartEngineVersion,
    positionProvider: source.positionProvider,
    placements: source.placements,
  };
}

function placementMap(placements: readonly SynastryChartPlacementSource[]) {
  return new Map(placements.map((placement) => [placement.body, placement]));
}

function requireExactShape(source: unknown, projected: unknown): void {
  if (!sameValue(source, projected)) invalid();
}

function normalizedLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 360;
}

function validText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\r\n]/.test(value)
  );
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function invalid(): never {
  throw new RangeError("Invalid compatibility fact input");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
