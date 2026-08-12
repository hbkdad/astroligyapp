import {
  calculateNatalAspects,
  type NatalChart,
} from "@/application/calculate-natal-chart";
import { calculateCompatibilityCategoryScores } from "@/application/calculate-compatibility-category-scores";
import { HouseOverlayEngine } from "@/application/calculate-house-overlays";
import { composeCompatibilityFacts } from "@/application/compose-compatibility-facts";
import { composeCompatibilityReport } from "@/application/compose-compatibility-report";
import { projectCompatibilityContent } from "@/application/project-compatibility-content";
import { renderCompatibilityContent } from "@/application/render-compatibility-content";
import { SynastryAspectEngine } from "@/application/calculate-synastry-aspects";
import { INITIAL_COMPATIBILITY_CATEGORY_POLICY } from "@/config/compatibility-category-policy";
import { findHouseNumber } from "@/domain/astro/house-strategies";
import { toZodiacPosition } from "@/domain/astro/zodiac";
import { PhaseOneCompatibilityStrategy } from "@/domain/compatibility/phase-one";
import type { NumerologyResult } from "@/domain/numerology/contracts";
import { ZOLLIKON_NATAL_CHART_DEMO } from "@/presentation/natal-chart-demo";
import { toCompatibilityReadModel } from "./compatibility-read-model";

const first = chart(
  "local-demo-a",
  [0, 18, 37, 59, 83, 111, 147, 191, 239, 301],
);
const second = chart(
  "local-demo-b",
  [180, 198, 217, 239, 263, 291, 327, 11, 59, 121],
);
const phaseOne = new PhaseOneCompatibilityStrategy().compare({
  first: {
    zodiacSign: "aries",
    lifePath: numerology(11),
    expression: numerology(5),
  },
  second: {
    zodiacSign: "libra",
    lifePath: numerology(7),
    expression: numerology(3),
  },
});
const aggregate = composeCompatibilityFacts({
  phaseOne,
  synastry: new SynastryAspectEngine().calculate(first, second),
  houseOverlays: new HouseOverlayEngine().calculate(first, second),
});
const scores = calculateCompatibilityCategoryScores(
  aggregate,
  INITIAL_COMPATIBILITY_CATEGORY_POLICY,
);
const projection = projectCompatibilityContent(aggregate, scores);
const rendered = renderCompatibilityContent(projection, aggregate, scores);

export const DEMO_COMPATIBILITY_REPORT = composeCompatibilityReport({
  aggregate,
  scores,
  projection,
  rendered,
});
export const DEMO_COMPATIBILITY = toCompatibilityReadModel(
  DEMO_COMPATIBILITY_REPORT,
);

function chart(providerId: string, longitudes: readonly number[]): NatalChart {
  const result = structuredClone(ZOLLIKON_NATAL_CHART_DEMO);
  result.input.timezoneSource = "private local demo timezone source";
  result.input.coordinateSource = "private local demo coordinate source";
  result.metadata.positionProvider.providerId = providerId;
  result.metadata.positionProvider.providerVersion = "local-demo-1.0.0";
  result.metadata.positionProvider.dataVersion = "local-demo-data-1.0.0";
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
function numerology(value: number): NumerologyResult {
  return {
    value,
    masterNumber: [11, 22, 33].includes(value),
    tokens: [{ source: "local-demo-private", normalized: "PRIVATE", value }],
    trace: [
      { operation: "local-demo-reduction", inputs: [value], result: value },
    ],
    strategyId: "pythagorean",
    strategyVersion: "1.0.0",
  };
}
