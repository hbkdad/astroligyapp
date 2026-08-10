import {
  PUBLIC_DAILY_PROJECTION_VERSION,
  PUBLIC_DAILY_READING_VERSION,
  PUBLIC_DAILY_SKY_SAMPLE_CONVENTION,
  PUBLIC_SIGN_TARGET_CONVENTION,
  type PublicDailyFact,
  type PublicDailyReadings,
} from "@/application/compose-public-daily-readings";
import {
  INTERPRETATION_RENDERER_VERSION,
  UNSUPPORTED_INTERPRETATION_FALLBACK,
  type RenderedInterpretationItem,
} from "@/application/render-interpretations";
import { CELESTIAL_BODIES } from "@/domain/astro/contracts";
import { ZODIAC_SIGNS, type ZodiacSign } from "@/domain/astro/zodiac";
import { LUNAR_PHASE_ENGINE_VERSION } from "@/domain/lunar/phase";

export const PUBLIC_HOROSCOPE_READ_MODEL_VERSION = "1.0.0";

export type PublicHoroscopeViewState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "unavailable" | "error"; message: string }>
  | Readonly<{ status: "ready"; model: PublicHoroscopeReadModel }>;

export interface PublicHoroscopeReadModel {
  readonly version: string;
  readonly sourceVersion: string;
  readonly sign: ZodiacSign;
  readonly signLabel: string;
  readonly title: string;
  readonly summary: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly effectiveAt: string;
  readonly sampleLabel: string;
  readonly items: readonly PublicHoroscopeDisplayItem[];
  readonly signNavigation: readonly PublicSignNavigationItem[];
  readonly trace: readonly Readonly<{ label: string; value: string }>[];
  readonly disclaimer: string;
}

export interface PublicSignNavigationItem {
  readonly sign: ZodiacSign;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}

export type PublicHoroscopeDisplayItem =
  | Readonly<{
      id: string;
      kind: "lunar" | "transit";
      title: string;
      status: "rendered";
      factText: string;
      reflectionText: string;
      sourceReference: string;
    }>
  | Readonly<{
      id: string;
      kind: "lunar" | "transit";
      title: string;
      status: "unsupported";
      fallbackText: string;
      sourceReference: string;
    }>;

export function toPublicHoroscopeReadModel(
  source: PublicDailyReadings,
  sign: ZodiacSign,
): PublicHoroscopeReadModel {
  validateSource(source);
  if (!ZODIAC_SIGNS.includes(sign))
    throw new RangeError("Unsupported public horoscope sign");
  const reading = source.readings[ZODIAC_SIGNS.indexOf(sign)]!;
  const items = reading.facts.map((fact, index) =>
    displayItem(fact, reading.rendered.items[index]!),
  );
  const signLabel = humanize(sign);
  return deepFreeze({
    version: PUBLIC_HOROSCOPE_READ_MODEL_VERSION,
    sourceVersion: source.version,
    sign,
    signLabel,
    title: `${signLabel} daily sky reflection.`,
    summary:
      "A general, non-personal reading built from one shared sky. Calculated facts and astrology-tradition reflections stay separate.",
    date: source.date,
    dateLabel: formatPlainDate(source.date),
    effectiveAt: source.effectiveAt,
    sampleLabel: "Shared sky sampled at 12:00 UTC",
    items,
    signNavigation: ZODIAC_SIGNS.map((item) => ({
      sign: item,
      label: humanize(item),
      href: `/horoscope/${item}`,
      current: item === sign,
    })),
    trace: [
      { label: "Public aggregate", value: source.version },
      {
        label: "Sky provider",
        value: `${source.sky.metadata.providerId} ${source.sky.metadata.providerVersion}`,
      },
      { label: "Sky data", value: source.sky.metadata.dataVersion },
      {
        label: "Sky frame",
        value: `${source.sky.metadata.zodiacReference}; ${source.sky.metadata.coordinateOrigin}; ${source.sky.metadata.referenceFrame}`,
      },
      {
        label: "Daily sample",
        value: `${source.metadata.skySampleConvention}; ${source.effectiveAt}`,
      },
      {
        label: "Sign model",
        value: source.metadata.signTargetConvention,
      },
      {
        label: "Lunar engine",
        value: source.metadata.lunarEngineVersion,
      },
      {
        label: "Aspect policy",
        value: `${source.metadata.aspectPolicy.id} ${source.metadata.aspectPolicy.version}`,
      },
      {
        label: "Interpretation projection",
        value: source.metadata.projectionVersion,
      },
      {
        label: "Public library",
        value: `${source.metadata.library.id} ${source.metadata.library.version} (${source.metadata.library.locale})`,
      },
      { label: "Renderer", value: INTERPRETATION_RENDERER_VERSION },
    ],
    disclaimer:
      "Astrology is presented as an interpretive tradition. This general sign model is not an individualized prediction or medical, legal, financial, relationship, or safety advice.",
  });
}

function displayItem(
  fact: PublicDailyFact,
  rendered: RenderedInterpretationItem,
): PublicHoroscopeDisplayItem {
  const kind = fact.kind === "shared-lunar-context" ? "lunar" : "transit";
  const title =
    fact.kind === "shared-lunar-context"
      ? `${humanize(fact.phase.phase)} Moon context`
      : `${humanize(fact.transitingBody)} ${humanize(fact.aspect.type)} sign model`;
  if (rendered.status === "unsupported")
    return {
      id: fact.id,
      kind,
      title,
      status: "unsupported",
      fallbackText: rendered.fallback.text,
      sourceReference: fact.id,
    };
  return {
    id: fact.id,
    kind,
    title,
    status: "rendered",
    factText: rendered.fact.text,
    reflectionText: rendered.interpretation.text,
    sourceReference: fact.id,
  };
}

function validateSource(source: PublicDailyReadings): void {
  if (
    source.version !== PUBLIC_DAILY_READING_VERSION ||
    source.dayTimezone !== "UTC" ||
    !validPlainDate(source.date) ||
    source.effectiveAt !== `${source.date}T12:00:00Z` ||
    source.sky.instant !== source.effectiveAt ||
    source.metadata.projectionVersion !== PUBLIC_DAILY_PROJECTION_VERSION ||
    source.metadata.lunarEngineVersion !== LUNAR_PHASE_ENGINE_VERSION ||
    source.metadata.signTargetConvention !== PUBLIC_SIGN_TARGET_CONVENTION ||
    source.metadata.skySampleConvention !== PUBLIC_DAILY_SKY_SAMPLE_CONVENTION
  )
    throw new RangeError("Unsupported public daily aggregate");
  validateSky(source);
  validateMetadata(source);
  if (
    source.readings.length !== ZODIAC_SIGNS.length ||
    source.readings.some(
      (reading, index) => reading.sunSign !== ZODIAC_SIGNS[index],
    )
  )
    throw new RangeError("Public sign coverage or ordering is invalid");

  const ids = new Set<string>();
  let sharedLunar: string | undefined;
  source.readings.forEach((reading, signIndex) => {
    const expectedPrefix = `public-daily:${source.date}:${reading.sunSign}`;
    if (
      reading.id !== expectedPrefix ||
      reading.target.convention !== PUBLIC_SIGN_TARGET_CONVENTION ||
      reading.target.longitudeDegrees !== signIndex * 30 + 15 ||
      reading.facts.length === 0 ||
      reading.facts.length !== reading.rendered.items.length ||
      reading.rendered.effectiveAt !== source.effectiveAt ||
      !Number.isFinite(Date.parse(reading.rendered.preparedAt))
    )
      throw new RangeError("Public sign reading is inconsistent");
    let previousBodyIndex = -1;
    reading.facts.forEach((fact, factIndex) => {
      if (ids.has(fact.id) || !fact.id.startsWith(`${expectedPrefix}:`))
        throw new RangeError("Public fact IDs must be unique and sign scoped");
      ids.add(fact.id);
      if (factIndex === 0) {
        if (
          fact.kind !== "shared-lunar-context" ||
          fact.id !== `${expectedPrefix}:lunar`
        )
          throw new RangeError("Shared lunar fact must be first");
        validateLunarFact(fact);
        const serialized = JSON.stringify(fact.phase);
        sharedLunar ??= serialized;
        if (serialized !== sharedLunar)
          throw new RangeError("Shared lunar geometry is inconsistent");
      } else {
        if (fact.kind !== "public-sun-sign-transit")
          throw new RangeError("Public transit ordering is invalid");
        const bodyIndex = CELESTIAL_BODIES.indexOf(fact.transitingBody);
        if (
          bodyIndex <= previousBodyIndex ||
          fact.id !==
            `${expectedPrefix}:transit:${fact.transitingBody}:${fact.aspect.type}`
        )
          throw new RangeError("Public transit identity or order is invalid");
        previousBodyIndex = bodyIndex;
        validateTransitFact(source, fact);
      }
      validateRenderedItem(source, fact, reading.rendered.items[factIndex]!);
    });
  });
}

function validateSky(source: PublicDailyReadings): void {
  const metadata = source.sky.metadata;
  if (
    source.sky.positions.length !== CELESTIAL_BODIES.length ||
    source.sky.positions.some(
      (position, index) =>
        position.body !== CELESTIAL_BODIES[index] ||
        !finiteRange(position.eclipticLongitudeDegrees, 0, 360),
    ) ||
    !validText(metadata.providerId) ||
    !validText(metadata.providerVersion) ||
    !validText(metadata.dataVersion) ||
    !Number.isFinite(Date.parse(metadata.calculatedAt)) ||
    metadata.timeScale !== "utc" ||
    metadata.referenceFrame !== "ecliptic-of-date" ||
    metadata.zodiacReference !== "tropical" ||
    metadata.coordinateOrigin !== "geocentric"
  )
    throw new RangeError("Public sky trace is invalid");
}

function validateMetadata(source: PublicDailyReadings): void {
  const metadata = source.metadata;
  if (
    !validText(metadata.aspectPolicy.id) ||
    !validText(metadata.aspectPolicy.version) ||
    metadata.aspectPolicy.definitions.length === 0 ||
    !validText(metadata.library.id) ||
    !validText(metadata.library.version) ||
    !validText(metadata.library.locale) ||
    !Number.isFinite(Date.parse(metadata.composedAt))
  )
    throw new RangeError("Public aggregate metadata is invalid");
}

function validateLunarFact(
  fact: Extract<PublicDailyFact, { kind: "shared-lunar-context" }>,
): void {
  if (
    !finiteRange(fact.phase.phaseAngleDegrees, 0, 360) ||
    !finiteRange(fact.phase.approximateIlluminatedFraction, 0, 1, true) ||
    !finiteRange(fact.phase.estimatedAgeDays, 0, 29.53059, true) ||
    !finiteRange(fact.phase.cycleProgress, 0, 1) ||
    !finiteRange(fact.phase.moonZodiac.longitudeDegrees, 0, 360) ||
    !finiteRange(fact.phase.moonZodiac.degreeWithinSign, 0, 30)
  )
    throw new RangeError("Public lunar fact is invalid");
}

function validateTransitFact(
  source: PublicDailyReadings,
  fact: Extract<PublicDailyFact, { kind: "public-sun-sign-transit" }>,
): void {
  const aspect = fact.aspect;
  const definition = source.metadata.aspectPolicy.definitions.find(
    (item) => item.type === aspect.type,
  );
  if (
    !CELESTIAL_BODIES.includes(fact.transitingBody) ||
    !definition ||
    aspect.exactAngleDegrees !== definition.exactAngleDegrees ||
    aspect.maximumOrbDegrees !== definition.maximumOrbDegrees ||
    !finiteRange(aspect.exactAngleDegrees, 0, 180, true) ||
    !Number.isFinite(aspect.maximumOrbDegrees) ||
    aspect.maximumOrbDegrees < 0 ||
    !finiteRange(aspect.actualAngleDegrees, 0, 180, true) ||
    !finiteRange(aspect.orbDegrees, 0, aspect.maximumOrbDegrees, true) ||
    !finiteRange(aspect.normalizedStrength, 0, 1, true)
  )
    throw new RangeError("Public transit fact is invalid");
}

function validateRenderedItem(
  source: PublicDailyReadings,
  fact: PublicDailyFact,
  rendered: RenderedInterpretationItem,
): void {
  const expectedTemplate =
    fact.kind === "shared-lunar-context"
      ? "public-lunar-context"
      : "public-sun-sign-transit";
  if (rendered.key !== `${fact.id}.projection`)
    throw new RangeError("Public rendered fact coverage is invalid");
  const section =
    rendered.status === "rendered" ? rendered.fact : rendered.fallback;
  const provenance = section.provenance;
  if (
    provenance.sourceFactId !== fact.id ||
    provenance.projectionKey !== rendered.key ||
    provenance.templateKey !== expectedTemplate ||
    provenance.projectionVersion !== source.metadata.projectionVersion ||
    provenance.contextVersion !== source.version ||
    provenance.libraryId !== source.metadata.library.id ||
    provenance.libraryVersion !== source.metadata.library.version ||
    provenance.locale !== source.metadata.library.locale ||
    provenance.rendererVersion !== INTERPRETATION_RENDERER_VERSION
  )
    throw new RangeError("Public rendered provenance is inconsistent");
  if (rendered.status === "unsupported") {
    if (rendered.fallback.text !== UNSUPPORTED_INTERPRETATION_FALLBACK)
      throw new RangeError("Public unsupported fallback is invalid");
    return;
  }
  if (
    JSON.stringify(rendered.interpretation.provenance) !==
      JSON.stringify(provenance) ||
    !validText(rendered.fact.text) ||
    !validText(rendered.interpretation.text) ||
    !rendered.interpretation.text.startsWith("Within astrology traditions,") ||
    !/not (?:an )?individualized/.test(rendered.interpretation.text) ||
    /\b(?:will|guaranteed|certainly|diagnose|cure|buy|sell|invest|lawsuit)\b/i.test(
      rendered.interpretation.text,
    )
  )
    throw new RangeError("Public rendered claims are invalid");
}

function validPlainDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function formatPlainDate(value: string): string {
  if (!validPlainDate(value))
    throw new RangeError("Invalid public display date");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function humanize(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function validText(value: string): boolean {
  return (
    Boolean(value.trim()) && value.length <= 1_024 && !/[\r\n]/.test(value)
  );
}

function finiteRange(
  value: number,
  minimum: number,
  maximum: number,
  inclusiveMaximum = false,
): boolean {
  return (
    Number.isFinite(value) &&
    value >= minimum &&
    (inclusiveMaximum ? value <= maximum : value < maximum)
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function isPublicHoroscopeSign(value: string): value is ZodiacSign {
  return ZODIAC_SIGNS.includes(value as ZodiacSign);
}
