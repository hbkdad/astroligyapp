import type { NatalChart } from "@/application/calculate-natal-chart";
import {
  canonicalizeRelationshipCharts,
  type SynastryChartSide,
} from "@/application/calculate-synastry-aspects";
import type { CelestialBody, ProviderMetadata } from "@/domain/astro/contracts";
import { findHouseNumber } from "@/domain/astro/house-strategies";

export const HOUSE_OVERLAY_ENGINE_VERSION = "1.0.0";

export interface HouseOverlayChartSource {
  readonly side: SynastryChartSide;
  readonly chartEngineVersion: string;
  readonly positionProvider: Readonly<Omit<ProviderMetadata, "calculatedAt">>;
  readonly houseProvider: Readonly<Omit<ProviderMetadata, "calculatedAt">>;
  readonly houseStrategy: Readonly<{ id: string; version: string }>;
  readonly placements: readonly Readonly<{
    body: CelestialBody;
    eclipticLongitudeDegrees: number;
  }>[];
  readonly cuspsLongitudeDegrees: readonly number[];
}

export interface HouseOverlayFact {
  readonly id: string;
  readonly source: Readonly<{
    chart: SynastryChartSide;
    body: CelestialBody;
    eclipticLongitudeDegrees: number;
  }>;
  readonly target: Readonly<{
    chart: SynastryChartSide;
    houseNumber: number;
    cuspLongitudeDegrees: number;
  }>;
}

export interface HouseOverlayResult {
  readonly version: string;
  readonly engine: Readonly<{ id: string; version: string }>;
  readonly housePolicy: Readonly<{ id: string; version: string }>;
  readonly charts: readonly [HouseOverlayChartSource, HouseOverlayChartSource];
  readonly overlays: readonly HouseOverlayFact[];
  readonly disclaimer: string;
}

export class InvalidHouseOverlayInputError extends Error {
  constructor() {
    super("House overlay input is invalid or unsupported");
    this.name = "InvalidHouseOverlayInputError";
  }
}

export class HouseOverlayEngine {
  readonly id = "deterministic-cross-chart-house-overlays";
  readonly version = HOUSE_OVERLAY_ENGINE_VERSION;

  calculate(first: NatalChart, second: NatalChart): HouseOverlayResult {
    let canonical: readonly [NatalChart, NatalChart];
    try {
      canonical = canonicalizeRelationshipCharts(first, second);
    } catch {
      throw new InvalidHouseOverlayInputError();
    }
    const charts: readonly [HouseOverlayChartSource, HouseOverlayChartSource] =
      [
        chartSource("chart-a", canonical[0]),
        chartSource("chart-b", canonical[1]),
      ];
    const overlays = [
      ...directionalOverlays(charts[0], charts[1]),
      ...directionalOverlays(charts[1], charts[0]),
    ];

    return deepFreeze({
      version: HOUSE_OVERLAY_ENGINE_VERSION,
      engine: { id: this.id, version: this.version },
      housePolicy: {
        id: charts[0].houseStrategy.id,
        version: charts[0].houseStrategy.version,
      },
      charts,
      overlays,
      disclaimer:
        "These are deterministic cross-chart house-placement facts, not a compatibility score, relationship prediction, or advice.",
    });
  }
}

function directionalOverlays(
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

function chartSource(
  side: SynastryChartSide,
  chart: NatalChart,
): HouseOverlayChartSource {
  return {
    side,
    chartEngineVersion: chart.metadata.chartEngineVersion,
    positionProvider: publicProviderMetadata(chart.metadata.positionProvider),
    houseProvider: publicProviderMetadata(chart.metadata.houseProvider),
    houseStrategy: { ...chart.metadata.houseStrategy },
    placements: chart.placements.map((placement) => ({
      body: placement.body,
      eclipticLongitudeDegrees: placement.eclipticLongitudeDegrees,
    })),
    cuspsLongitudeDegrees: [...chart.houses.cuspsLongitudeDegrees],
  };
}

function publicProviderMetadata(
  metadata: ProviderMetadata,
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
