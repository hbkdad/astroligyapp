import type { NatalChart } from "@/application/calculate-natal-chart";
import { CELESTIAL_BODIES, type CelestialBody } from "@/domain/astro/contracts";

export const NATAL_CHART_READ_MODEL_VERSION = "1.0.0";
export const NATAL_CHART_VIEWBOX_SIZE = 600;

const CENTER = NATAL_CHART_VIEWBOX_SIZE / 2;
const ZODIAC_SIGNS = [
  ["aries", "Aries", "♈"],
  ["taurus", "Taurus", "♉"],
  ["gemini", "Gemini", "♊"],
  ["cancer", "Cancer", "♋"],
  ["leo", "Leo", "♌"],
  ["virgo", "Virgo", "♍"],
  ["libra", "Libra", "♎"],
  ["scorpio", "Scorpio", "♏"],
  ["sagittarius", "Sagittarius", "♐"],
  ["capricorn", "Capricorn", "♑"],
  ["aquarius", "Aquarius", "♒"],
  ["pisces", "Pisces", "♓"],
] as const;

const BODY_GLYPHS: Readonly<Record<CelestialBody, string>> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
};

export type NatalChartViewState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "unavailable"; message: string }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "ready"; model: NatalChartReadModel }>;

export interface NatalChartReadModel {
  readonly version: string;
  readonly title: string;
  readonly subtitle: string;
  readonly orientationLabel: string;
  readonly placements: readonly NatalPlacementView[];
  readonly aspects: readonly NatalAspectView[];
  readonly houses: readonly HouseLineView[];
  readonly signs: readonly ZodiacSignView[];
  readonly axes: readonly AngleAxisView[];
  readonly trace: readonly Readonly<{ label: string; value: string }>[];
}

export interface NatalPlacementView {
  readonly body: CelestialBody;
  readonly bodyLabel: string;
  readonly glyph: string;
  readonly sign: string;
  readonly signLabel: string;
  readonly degreeLabel: string;
  readonly longitudeLabel: string;
  readonly houseNumber: number;
  readonly x: number;
  readonly y: number;
  readonly accessibleLabel: string;
  readonly aspectCount: number;
}

export interface NatalAspectView {
  readonly id: string;
  readonly firstBody: string;
  readonly secondBody: string;
  readonly type: string;
  readonly orbLabel: string;
  readonly phase: string;
  readonly strengthLabel: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface HouseLineView {
  readonly number: number;
  readonly cuspLabel: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly labelX: number;
  readonly labelY: number;
}

export interface ZodiacSignView {
  readonly key: string;
  readonly label: string;
  readonly glyph: string;
  readonly x: number;
  readonly y: number;
}

export interface AngleAxisView {
  readonly id: "horizon" | "meridian";
  readonly startLabel: "ASC" | "MC";
  readonly endLabel: "DSC" | "IC";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly startLabelX: number;
  readonly startLabelY: number;
  readonly endLabelX: number;
  readonly endLabelY: number;
}

export function toNatalChartReadModel(chart: NatalChart): NatalChartReadModel {
  validateChart(chart);
  const longitudes = new Map(
    chart.placements.map((placement) => [
      placement.body,
      placement.eclipticLongitudeDegrees,
    ]),
  );
  const placements = chart.placements.map((placement, index) => {
    const point = pointAtLongitude(
      placement.eclipticLongitudeDegrees,
      190 + (index % 3) * 20,
    );
    const bodyLabel = humanize(placement.body);
    const signLabel = humanize(placement.zodiac.sign);
    const degreeLabel = `${formatNumber(placement.zodiac.degreeWithinSign)}° ${signLabel}`;
    const aspectCount = chart.aspects.filter(
      (aspect) =>
        aspect.firstBody === placement.body ||
        aspect.secondBody === placement.body,
    ).length;
    return {
      body: placement.body,
      bodyLabel,
      glyph: BODY_GLYPHS[placement.body],
      sign: placement.zodiac.sign,
      signLabel,
      degreeLabel,
      longitudeLabel: `${formatNumber(placement.eclipticLongitudeDegrees)}° tropical longitude`,
      houseNumber: placement.houseNumber,
      x: point.x,
      y: point.y,
      accessibleLabel: `${bodyLabel}, ${degreeLabel}, house ${placement.houseNumber}, ${aspectCount} major ${aspectCount === 1 ? "aspect" : "aspects"}`,
      aspectCount,
    };
  });
  const aspects = chart.aspects.map((aspect) => {
    const first = pointAtLongitude(longitudes.get(aspect.firstBody)!, 150);
    const second = pointAtLongitude(longitudes.get(aspect.secondBody)!, 150);
    return {
      id: `${aspect.firstBody}-${aspect.type}-${aspect.secondBody}`,
      firstBody: humanize(aspect.firstBody),
      secondBody: humanize(aspect.secondBody),
      type: humanize(aspect.type),
      orbLabel: `${formatNumber(aspect.orbDegrees)}°`,
      phase: humanize(aspect.phase),
      strengthLabel: `${Math.round(aspect.normalizedStrength * 100)}% configured orb strength`,
      x1: first.x,
      y1: first.y,
      x2: second.x,
      y2: second.y,
    };
  });
  const houses = chart.houses.cuspsLongitudeDegrees.map((longitude, index) => {
    const inner = pointAtLongitude(longitude, 115);
    const outer = pointAtLongitude(longitude, 250);
    const label = pointAtLongitude(longitude + 15, 133);
    return {
      number: index + 1,
      cuspLabel: `${formatNumber(longitude)}°`,
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
      labelX: label.x,
      labelY: label.y,
    };
  });
  const signs = ZODIAC_SIGNS.map(([key, label, glyph], index) => ({
    key,
    label,
    glyph,
    ...pointAtLongitude(index * 30 + 15, 274),
  }));
  return deepFreeze({
    version: NATAL_CHART_READ_MODEL_VERSION,
    title: "Natal chart",
    subtitle: `${formatInstant(chart.input.instant)} · ${chart.input.timezone}`,
    orientationLabel:
      "Tropical zodiac wheel with 0° Aries at the top and longitudes increasing clockwise.",
    placements,
    aspects,
    houses,
    signs,
    axes: [
      axis("horizon", "ASC", "DSC", chart.houses.ascendantLongitudeDegrees),
      axis("meridian", "MC", "IC", chart.houses.midheavenLongitudeDegrees),
    ],
    trace: [
      { label: "Chart engine", value: chart.metadata.chartEngineVersion },
      {
        label: "Position provider",
        value: `${chart.metadata.positionProvider.providerId} ${chart.metadata.positionProvider.providerVersion}`,
      },
      {
        label: "Position data",
        value: chart.metadata.positionProvider.dataVersion,
      },
      {
        label: "House provider",
        value: `${chart.metadata.houseProvider.providerId} ${chart.metadata.houseProvider.providerVersion}`,
      },
      {
        label: "House strategy",
        value: `${chart.metadata.houseStrategy.id} ${chart.metadata.houseStrategy.version}`,
      },
      {
        label: "Aspect policy",
        value: `${chart.metadata.aspectPolicy.id} ${chart.metadata.aspectPolicy.version}`,
      },
      { label: "Coordinate origin", value: chart.input.coordinateOrigin },
      { label: "Timezone source", value: chart.input.timezoneSource },
      { label: "Coordinate source", value: chart.input.coordinateSource },
    ],
  });
}

export function pointAtLongitude(
  longitudeDegrees: number,
  radius: number,
): Readonly<{ x: number; y: number }> {
  if (
    !Number.isFinite(longitudeDegrees) ||
    longitudeDegrees < 0 ||
    longitudeDegrees >= 360 ||
    !Number.isFinite(radius) ||
    radius < 0 ||
    radius > CENTER
  ) {
    throw new RangeError(
      "Chart layout requires normalized longitude and radius",
    );
  }
  const radians = ((longitudeDegrees - 90) * Math.PI) / 180;
  return {
    x: precise(CENTER + Math.cos(radians) * radius),
    y: precise(CENTER + Math.sin(radians) * radius),
  };
}

function axis(
  id: AngleAxisView["id"],
  startLabel: AngleAxisView["startLabel"],
  endLabel: AngleAxisView["endLabel"],
  longitude: number,
): AngleAxisView {
  const opposite = (longitude + 180) % 360;
  const start = pointAtLongitude(longitude, 255);
  const end = pointAtLongitude(opposite, 255);
  const startText = pointAtLongitude(longitude, 288);
  const endText = pointAtLongitude(opposite, 288);
  return {
    id,
    startLabel,
    endLabel,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    startLabelX: startText.x,
    startLabelY: startText.y,
    endLabelX: endText.x,
    endLabelY: endText.y,
  };
}

function validateChart(chart: NatalChart): void {
  const bodies = chart.placements.map((placement) => placement.body);
  if (
    bodies.length !== CELESTIAL_BODIES.length ||
    new Set(bodies).size !== bodies.length ||
    CELESTIAL_BODIES.some((body) => !bodies.includes(body))
  ) {
    throw new RangeError(
      "Natal chart must contain every supported body exactly once",
    );
  }
  if (chart.houses.cuspsLongitudeDegrees.length !== 12) {
    throw new RangeError("Natal chart must contain twelve house cusps");
  }
  const allLongitudes = [
    ...chart.placements.map((placement) => placement.eclipticLongitudeDegrees),
    ...chart.houses.cuspsLongitudeDegrees,
    chart.houses.ascendantLongitudeDegrees,
    chart.houses.midheavenLongitudeDegrees,
  ];
  if (
    allLongitudes.some(
      (longitude) =>
        !Number.isFinite(longitude) || longitude < 0 || longitude >= 360,
    ) ||
    chart.placements.some(
      (placement) =>
        placement.houseNumber < 1 ||
        placement.houseNumber > 12 ||
        placement.zodiac.longitudeDegrees !==
          placement.eclipticLongitudeDegrees,
    )
  ) {
    throw new RangeError("Natal chart contains invalid normalized facts");
  }
  const knownBodies = new Set(bodies);
  const aspectIds = chart.aspects.map(
    (aspect) => `${aspect.firstBody}:${aspect.secondBody}:${aspect.type}`,
  );
  if (
    new Set(aspectIds).size !== aspectIds.length ||
    chart.aspects.some(
      (aspect) =>
        !knownBodies.has(aspect.firstBody) ||
        !knownBodies.has(aspect.secondBody) ||
        !Number.isFinite(aspect.orbDegrees) ||
        aspect.orbDegrees < 0 ||
        aspect.orbDegrees > aspect.maximumOrbDegrees,
    )
  ) {
    throw new RangeError("Natal chart contains invalid aspect facts");
  }
  for (const value of [
    chart.metadata.chartEngineVersion,
    chart.metadata.positionProvider.providerId,
    chart.metadata.positionProvider.providerVersion,
    chart.metadata.positionProvider.dataVersion,
    chart.metadata.houseProvider.providerId,
    chart.metadata.houseProvider.providerVersion,
    chart.metadata.houseProvider.dataVersion,
    chart.metadata.houseStrategy.id,
    chart.metadata.houseStrategy.version,
    chart.metadata.aspectPolicy.id,
    chart.metadata.aspectPolicy.version,
  ]) {
    if (!value.trim())
      throw new RangeError("Natal chart trace versions are required");
  }
}

function humanize(value: string): string {
  return value
    .split(/[._\-/]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatInstant(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()))
    throw new RangeError("Invalid chart instant");
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ] as const;
  const hour = parsed.getUTCHours().toString().padStart(2, "0");
  const minute = parsed.getUTCMinutes().toString().padStart(2, "0");

  return `${monthNames[parsed.getUTCMonth()]} ${parsed.getUTCDate()}, ${parsed.getUTCFullYear()} · ${hour}:${minute} UTC`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function precise(value: number): number {
  return Number(value.toFixed(4));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
