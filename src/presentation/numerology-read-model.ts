import {
  TIMELINE_FACTS_VERSION,
  type TimelineFacts,
} from "@/application/compose-timeline-facts";
import type { NumerologyResult } from "@/domain/numerology/contracts";

export const NUMEROLOGY_READ_MODEL_VERSION = "1.0.0";
export const CORE_NUMEROLOGY_KEYS = [
  "life-path",
  "expression",
  "soul-urge",
  "personality",
  "birthday",
  "maturity",
] as const;
export type CoreNumerologyKey = (typeof CORE_NUMEROLOGY_KEYS)[number];

export interface NumerologyPresentationSource {
  readonly fullBirthName: string;
  readonly birthDate: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly core: Readonly<Record<CoreNumerologyKey, NumerologyResult>>;
  readonly timeline: TimelineFacts;
}

export type NumerologyViewState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "unavailable" | "locked" | "error"; message: string }>
  | Readonly<{ status: "ready"; model: NumerologyReadModel }>;

export interface NumerologyReadModel {
  readonly version: string;
  readonly title: string;
  readonly subtitle: string;
  readonly convention: string;
  readonly core: readonly NumerologyDisplayItem[];
  readonly cycles: readonly NumerologyCycleItem[];
  readonly trace: readonly Readonly<{ label: string; value: string }>[];
}

export interface NumerologyDisplayItem {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly masterNumber: boolean;
  readonly tokenLabel: string;
  readonly operations: readonly string[];
}

export interface NumerologyCycleItem extends NumerologyDisplayItem {
  readonly id: string;
  readonly localDate: string;
  readonly dateLabel: string;
  readonly dateTime: string;
  readonly timezone: string;
}

export function toNumerologyReadModel(
  source: NumerologyPresentationSource,
): NumerologyReadModel {
  validateSource(source);
  const core = CORE_NUMEROLOGY_KEYS.map((key) =>
    displayItem(key, source.core[key]),
  );
  const cycles = source.timeline.facts.flatMap(
    (fact): NumerologyCycleItem[] => {
      if (
        fact.type !== "personal-year-boundary" &&
        fact.type !== "personal-month-boundary" &&
        fact.type !== "personal-day-boundary"
      )
        return [];
      if (!("result" in fact.source))
        throw new RangeError("Numerology boundary source mismatch");
      const key = fact.type.replace("-boundary", "");
      return [
        {
          ...displayItem(key, fact.source.result),
          id: fact.id,
          localDate: fact.source.request.localDate,
          dateLabel: formatPlainDate(fact.source.request.localDate),
          dateTime: fact.source.request.instant,
          timezone: fact.source.request.timezone.replaceAll("_", " "),
        },
      ];
    },
  );
  return deepFreeze({
    version: NUMEROLOGY_READ_MODEL_VERSION,
    title: "Your deterministic numerology profile.",
    subtitle: `${source.fullBirthName} · born ${formatPlainDate(source.birthDate)}`,
    convention: `${humanize(source.strategyId)} ${source.strategyVersion}; master numbers 11, 22, and 33 are preserved by the selected strategy. Y is treated as a consonant.`,
    core,
    cycles,
    trace: [
      {
        label: "Strategy",
        value: `${source.strategyId} ${source.strategyVersion}`,
      },
      { label: "Name input", value: source.fullBirthName },
      { label: "Birth date", value: source.birthDate },
      { label: "Timeline composition", value: source.timeline.version },
      {
        label: "Timeline strategy",
        value: `${source.timeline.metadata.sourceVersions.numerologyStrategy!.id} ${source.timeline.metadata.sourceVersions.numerologyStrategy!.version}`,
      },
    ],
  });
}

function displayItem(
  key: string,
  result: NumerologyResult,
): NumerologyDisplayItem {
  return {
    key,
    label: humanize(key),
    value: result.value,
    masterNumber: result.masterNumber,
    tokenLabel: result.tokens
      .map((token) => `${token.normalized}:${token.value}`)
      .join(" · "),
    operations: result.trace.map(
      (step) => `${step.operation}(${step.inputs.join(", ")}) = ${step.result}`,
    ),
  };
}

function validateSource(source: NumerologyPresentationSource): void {
  if (
    !validText(source.fullBirthName) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(source.birthDate) ||
    !validText(source.strategyId) ||
    !validText(source.strategyVersion)
  )
    throw new RangeError("Numerology presentation identity is invalid");
  for (const key of CORE_NUMEROLOGY_KEYS)
    validateResult(source.core[key], source);
  if (
    source.timeline.version !== TIMELINE_FACTS_VERSION ||
    !source.timeline.metadata.sourceVersions.numerologyStrategy
  )
    throw new RangeError("Numerology timeline strategy is required");
  const timelineStrategy =
    source.timeline.metadata.sourceVersions.numerologyStrategy;
  if (
    timelineStrategy.id !== source.strategyId ||
    timelineStrategy.version !== source.strategyVersion
  )
    throw new RangeError("Numerology strategy versions are inconsistent");
  let previous = Number.NEGATIVE_INFINITY;
  const ids = new Set<string>();
  for (const fact of source.timeline.facts) {
    if (
      fact.type !== "personal-year-boundary" &&
      fact.type !== "personal-month-boundary" &&
      fact.type !== "personal-day-boundary"
    )
      continue;
    if (!("result" in fact.source))
      throw new RangeError("Numerology boundary source mismatch");
    validateResult(fact.source.result, source);
    const instant = Date.parse(fact.source.request.instant);
    if (!Number.isFinite(instant) || instant < previous || ids.has(fact.id))
      throw new RangeError("Numerology cycle facts are invalid");
    previous = instant;
    ids.add(fact.id);
  }
}

function validateResult(
  result: NumerologyResult,
  source: Pick<NumerologyPresentationSource, "strategyId" | "strategyVersion">,
): void {
  if (
    result.strategyId !== source.strategyId ||
    result.strategyVersion !== source.strategyVersion ||
    !Number.isInteger(result.value) ||
    result.value < 1 ||
    result.tokens.length === 0 ||
    result.trace.length === 0
  )
    throw new RangeError("Numerology result trace is invalid");
  for (const token of result.tokens)
    if (
      !validText(token.source) ||
      !validText(token.normalized) ||
      !Number.isInteger(token.value)
    )
      throw new RangeError("Numerology token trace is invalid");
  for (const step of result.trace)
    if (!validText(step.operation) || !Number.isFinite(step.result))
      throw new RangeError("Numerology operation trace is invalid");
}

function formatPlainDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    throw new RangeError("Invalid numerology date");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
function humanize(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function validText(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 512 && !/[\r\n]/.test(value);
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
