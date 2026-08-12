import {
  NATAL_ASPECT_POLICY_ID,
  NATAL_ASPECT_POLICY_VERSION,
  NATAL_CHART_ENGINE_VERSION,
  calculateNatalAspects,
  type NatalAspect,
  type NatalChart,
  type NatalPlacement,
} from "@/application/calculate-natal-chart";
import {
  DEFAULT_ASPECT_DEFINITIONS,
  findClosestAspect,
  validateAspectDefinitions,
  type AspectDefinition,
  type AspectMatch,
} from "@/domain/astro/aspects";
import {
  CELESTIAL_BODIES,
  type CelestialBody,
  type CelestialPosition,
  type HouseRequest,
  type PositionRequest,
  type ProviderMetadata,
} from "@/domain/astro/contracts";
import {
  findHouseNumber,
  WHOLE_SIGN_HOUSE_SYSTEM,
  WHOLE_SIGN_STRATEGY_VERSION,
} from "@/domain/astro/house-strategies";
import {
  validateHouseRequest,
  validateHouseResult,
  validatePositionRequest,
  validatePositionResult,
} from "@/domain/astro/provider-validation";
import { toZodiacPosition } from "@/domain/astro/zodiac";

export const SYNASTRY_ASPECT_ENGINE_VERSION = "1.0.0";
export const SYNASTRY_ASPECT_DISCLAIMER =
  "These are deterministic cross-chart aspect facts, not a compatibility score, relationship prediction, or advice.";
export const DEFAULT_SYNASTRY_ASPECT_POLICY: SynastryAspectPolicy = deepFreeze({
  id: "cross-chart-major-aspects",
  version: "1.0.0",
  definitions: DEFAULT_ASPECT_DEFINITIONS.map((definition) => ({
    ...definition,
  })),
});

export interface SynastryAspectPolicy {
  readonly id: string;
  readonly version: string;
  readonly definitions: readonly AspectDefinition[];
}

export type SynastryChartSide = "chart-a" | "chart-b";

export interface SynastryChartPlacementSource {
  readonly body: CelestialBody;
  readonly eclipticLongitudeDegrees: number;
  readonly speedLongitudeDegreesPerDay?: number;
}

export interface SynastryChartSource {
  readonly side: SynastryChartSide;
  readonly chartEngineVersion: string;
  readonly positionProvider: Readonly<Omit<ProviderMetadata, "calculatedAt">>;
  readonly placements: readonly SynastryChartPlacementSource[];
}

export interface SynastryAspectEndpoint {
  readonly chart: SynastryChartSide;
  readonly body: CelestialBody;
}

export interface SynastryAspectFact extends AspectMatch {
  readonly id: string;
  readonly first: SynastryAspectEndpoint;
  readonly second: SynastryAspectEndpoint;
}

export interface SynastryAspectResult {
  readonly version: string;
  readonly engine: Readonly<{ id: string; version: string }>;
  readonly aspectPolicy: SynastryAspectPolicy;
  readonly charts: readonly [SynastryChartSource, SynastryChartSource];
  readonly aspects: readonly SynastryAspectFact[];
  readonly disclaimer: string;
}

export class InvalidSynastryInputError extends Error {
  constructor(message = "Synastry input is invalid or unsupported") {
    super(message);
    this.name = "InvalidSynastryInputError";
  }
}

export class SynastryAspectEngine {
  readonly id = "deterministic-cross-chart-aspects";
  readonly version = SYNASTRY_ASPECT_ENGINE_VERSION;
  private readonly policy: SynastryAspectPolicy;

  constructor(policy: SynastryAspectPolicy = DEFAULT_SYNASTRY_ASPECT_POLICY) {
    validatePolicy(policy);
    this.policy = deepFreeze(structuredClone(policy));
  }

  calculate(first: NatalChart, second: NatalChart): SynastryAspectResult {
    const sources = canonicalSources(first, second);
    const firstPlacements = placementMap(sources[0]);
    const secondPlacements = placementMap(sources[1]);
    const aspects: SynastryAspectFact[] = [];

    for (const firstBody of CELESTIAL_BODIES) {
      const firstPlacement = firstPlacements.get(firstBody)!;
      for (const secondBody of CELESTIAL_BODIES) {
        const secondPlacement = secondPlacements.get(secondBody)!;
        const match = findClosestAspect(
          firstPlacement.eclipticLongitudeDegrees,
          secondPlacement.eclipticLongitudeDegrees,
          this.policy.definitions,
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

    return deepFreeze({
      version: SYNASTRY_ASPECT_ENGINE_VERSION,
      engine: { id: this.id, version: this.version },
      aspectPolicy: structuredClone(this.policy),
      charts: sources,
      aspects,
      disclaimer: SYNASTRY_ASPECT_DISCLAIMER,
    });
  }
}

function validatePolicy(policy: SynastryAspectPolicy): void {
  try {
    if (!validVersionText(policy.id) || !validVersionText(policy.version))
      throw new RangeError("Invalid policy identity");
    validateAspectDefinitions(policy.definitions);
  } catch {
    throw new InvalidSynastryInputError("Synastry aspect policy is invalid");
  }
}

export function validateRelationshipNatalChart(chart: NatalChart): void {
  try {
    validateChart(chart);
  } catch {
    throw new InvalidSynastryInputError();
  }
}

export function canonicalizeRelationshipCharts(
  first: NatalChart,
  second: NatalChart,
): readonly [NatalChart, NatalChart] {
  validateRelationshipNatalChart(first);
  validateRelationshipNatalChart(second);
  const candidates = [first, second].sort((left, right) => {
    const leftKey = sourceSortKey(left);
    const rightKey = sourceSortKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return [candidates[0]!, candidates[1]!];
}

function validateChart(chart: NatalChart): void {
  if (!chart || typeof chart !== "object")
    throw new RangeError("Invalid chart");
  if (
    chart.metadata.chartEngineVersion !== NATAL_CHART_ENGINE_VERSION ||
    chart.metadata.aspectPolicy.id !== NATAL_ASPECT_POLICY_ID ||
    chart.metadata.aspectPolicy.version !== NATAL_ASPECT_POLICY_VERSION ||
    chart.metadata.houseStrategy.id !== WHOLE_SIGN_HOUSE_SYSTEM ||
    chart.metadata.houseStrategy.version !== WHOLE_SIGN_STRATEGY_VERSION ||
    chart.input.houseSystem !== WHOLE_SIGN_HOUSE_SYSTEM
  )
    throw new RangeError("Unsupported chart version");
  validateSource(chart.input.timezoneSource);
  validateSource(chart.input.coordinateSource);
  new Intl.DateTimeFormat("en-CA", { timeZone: chart.input.timezone }).format();
  validateAspectDefinitions(chart.metadata.aspectPolicy.definitions);
  validateChartCalculatedAt(chart.metadata.calculatedAt);
  if (
    chart.placements.length !== CELESTIAL_BODIES.length ||
    chart.placements.some(
      (placement, index) => placement.body !== CELESTIAL_BODIES[index],
    )
  )
    throw new RangeError("Incomplete chart placements");

  const positionRequest: PositionRequest = {
    instant: chart.input.instant,
    bodies: CELESTIAL_BODIES,
    zodiacReference: "tropical",
    coordinateOrigin: chart.input.coordinateOrigin,
    ...(chart.input.coordinateOrigin === "topocentric"
      ? { observer: chart.input.observer }
      : {}),
  };
  validatePositionRequest(positionRequest);
  validatePositionResult(
    chart.metadata.positionProvider.providerId,
    positionRequest,
    {
      instant: chart.input.instant,
      positions: chart.placements.map(toPosition),
      metadata: chart.metadata.positionProvider,
    },
  );

  const houseRequest: HouseRequest = {
    instant: chart.input.instant,
    observer: chart.input.observer,
    houseSystem: chart.input.houseSystem,
    zodiacReference: "tropical",
  };
  validateHouseRequest(houseRequest);
  validateHouseResult(chart.metadata.houseProvider.providerId, houseRequest, {
    instant: chart.input.instant,
    ...chart.houses,
    metadata: chart.metadata.houseProvider,
  });

  for (const placement of chart.placements) {
    const expectedZodiac = toZodiacPosition(placement.eclipticLongitudeDegrees);
    if (
      placement.zodiac.longitudeDegrees !== expectedZodiac.longitudeDegrees ||
      placement.zodiac.signIndex !== expectedZodiac.signIndex ||
      placement.zodiac.sign !== expectedZodiac.sign ||
      placement.zodiac.degreeWithinSign !== expectedZodiac.degreeWithinSign ||
      placement.houseNumber !==
        findHouseNumber(
          placement.eclipticLongitudeDegrees,
          chart.houses.cuspsLongitudeDegrees,
        )
    )
      throw new RangeError("Inconsistent chart placement");
  }

  const expectedAspects = calculateNatalAspects(
    chart.placements,
    chart.metadata.aspectPolicy.definitions,
  );
  if (
    expectedAspects.length !== chart.aspects.length ||
    expectedAspects.some(
      (expected, index) => !sameNatalAspect(expected, chart.aspects[index]),
    )
  )
    throw new RangeError("Inconsistent natal aspects");
}

function toPosition(placement: NatalPlacement): CelestialPosition {
  return {
    body: placement.body,
    eclipticLongitudeDegrees: placement.eclipticLongitudeDegrees,
    ...(placement.eclipticLatitudeDegrees !== undefined
      ? { eclipticLatitudeDegrees: placement.eclipticLatitudeDegrees }
      : {}),
    ...(placement.distanceAu !== undefined
      ? { distanceAu: placement.distanceAu }
      : {}),
    ...(placement.speedLongitudeDegreesPerDay !== undefined
      ? { speedLongitudeDegreesPerDay: placement.speedLongitudeDegreesPerDay }
      : {}),
  };
}

function sameNatalAspect(
  expected: NatalAspect,
  actual: NatalAspect | undefined,
): boolean {
  return Boolean(
    actual &&
    expected.firstBody === actual.firstBody &&
    expected.secondBody === actual.secondBody &&
    expected.type === actual.type &&
    expected.exactAngleDegrees === actual.exactAngleDegrees &&
    expected.actualAngleDegrees === actual.actualAngleDegrees &&
    expected.orbDegrees === actual.orbDegrees &&
    expected.maximumOrbDegrees === actual.maximumOrbDegrees &&
    expected.phase === actual.phase &&
    expected.normalizedStrength === actual.normalizedStrength,
  );
}

function canonicalSources(
  first: NatalChart,
  second: NatalChart,
): readonly [SynastryChartSource, SynastryChartSource] {
  const charts = canonicalizeRelationshipCharts(first, second);
  return [
    { side: "chart-a", ...sourceFacts(charts[0]) },
    { side: "chart-b", ...sourceFacts(charts[1]) },
  ];
}

function sourceSortKey(chart: NatalChart): string {
  return JSON.stringify(sourceFacts(chart));
}

function sourceFacts(chart: NatalChart): Omit<SynastryChartSource, "side"> {
  const metadata = chart.metadata.positionProvider;
  const positionProvider: Omit<ProviderMetadata, "calculatedAt"> = {
    providerId: metadata.providerId,
    providerVersion: metadata.providerVersion,
    dataVersion: metadata.dataVersion,
    timeScale: metadata.timeScale,
    referenceFrame: metadata.referenceFrame,
    zodiacReference: metadata.zodiacReference,
    coordinateOrigin: metadata.coordinateOrigin,
  };
  return {
    chartEngineVersion: chart.metadata.chartEngineVersion,
    positionProvider,
    placements: chart.placements.map((placement) => ({
      body: placement.body,
      eclipticLongitudeDegrees: placement.eclipticLongitudeDegrees,
      ...(placement.speedLongitudeDegreesPerDay !== undefined
        ? { speedLongitudeDegreesPerDay: placement.speedLongitudeDegreesPerDay }
        : {}),
    })),
  };
}

function placementMap(source: SynastryChartSource) {
  return new Map(
    source.placements.map((placement) => [placement.body, placement]),
  );
}

function validateSource(value: string): void {
  if (!validVersionText(value)) throw new RangeError("Invalid source");
}

function validateChartCalculatedAt(value: string): void {
  validatePositionRequest({
    instant: value,
    bodies: ["sun"],
    zodiacReference: "tropical",
    coordinateOrigin: "geocentric",
  });
}

function validVersionText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\r\n]/.test(value)
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
