export const CIVIL_TIME_RESOLVER_VERSION = "1.0.0";

export interface CivilDateTime {
  date: string;
  time: string;
  timezone: string;
}

export type CivilTimeResolution =
  | Readonly<{
      status: "unique";
      instant: string;
      offsetSeconds: number;
      resolverVersion: typeof CIVIL_TIME_RESOLVER_VERSION;
    }>
  | Readonly<{
      status: "ambiguous";
      candidates: readonly Readonly<{
        instant: string;
        offsetSeconds: number;
      }>[];
      resolverVersion: typeof CIVIL_TIME_RESOLVER_VERSION;
    }>
  | Readonly<{
      status: "nonexistent";
      resolverVersion: typeof CIVIL_TIME_RESOLVER_VERSION;
    }>;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const OFFSET_PATTERN = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

export function resolveCivilTime(input: CivilDateTime): CivilTimeResolution {
  const dateMatch = DATE_PATTERN.exec(input.date);
  const timeMatch = TIME_PATTERN.exec(input.time);
  if (!dateMatch || !timeMatch) {
    throw new RangeError(
      "Civil date and time must be canonical minute precision",
    );
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const naiveMilliseconds = Date.UTC(year, month - 1, day, hour, minute, 0);
  const naive = new Date(naiveMilliseconds);
  if (
    naive.getUTCFullYear() !== year ||
    naive.getUTCMonth() !== month - 1 ||
    naive.getUTCDate() !== day
  ) {
    throw new RangeError("Civil date must exist in the Gregorian calendar");
  }

  const formatter = createFormatter(input.timezone);
  const offsets = new Set<number>();
  for (let deltaMinutes = -2_880; deltaMinutes <= 2_880; deltaMinutes += 30) {
    offsets.add(
      readOffsetSeconds(formatter, naiveMilliseconds + deltaMinutes * 60_000),
    );
  }

  const candidates = [...offsets]
    .map((offsetSeconds) => ({
      instantMilliseconds: naiveMilliseconds - offsetSeconds * 1_000,
      offsetSeconds,
    }))
    .filter(({ instantMilliseconds }) =>
      sameCivilMinute(formatter, instantMilliseconds, {
        year,
        month,
        day,
        hour,
        minute,
      }),
    )
    .sort((left, right) => left.instantMilliseconds - right.instantMilliseconds)
    .map(({ instantMilliseconds, offsetSeconds }) =>
      Object.freeze({
        instant: new Date(instantMilliseconds).toISOString(),
        offsetSeconds,
      }),
    );

  if (candidates.length === 0) {
    return Object.freeze({
      status: "nonexistent",
      resolverVersion: CIVIL_TIME_RESOLVER_VERSION,
    });
  }
  if (candidates.length === 1) {
    return Object.freeze({
      status: "unique",
      instant: candidates[0]!.instant,
      offsetSeconds: candidates[0]!.offsetSeconds,
      resolverVersion: CIVIL_TIME_RESOLVER_VERSION,
    });
  }
  return Object.freeze({
    status: "ambiguous",
    candidates: Object.freeze(candidates),
    resolverVersion: CIVIL_TIME_RESOLVER_VERSION,
  });
}

function createFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    });
  } catch {
    throw new RangeError("Timezone must be a supported IANA timezone");
  }
}

function readOffsetSeconds(
  formatter: Intl.DateTimeFormat,
  instant: number,
): number {
  const name = formatter
    .formatToParts(new Date(instant))
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name ? OFFSET_PATTERN.exec(name) : null;
  if (!match) throw new RangeError("Timezone offset could not be resolved");
  if (!match[1]) return 0;
  const seconds =
    Number(match[2]) * 3_600 + Number(match[3]) * 60 + Number(match[4] ?? 0);
  return match[1] === "-" ? -seconds : seconds;
}

function sameCivilMinute(
  formatter: Intl.DateTimeFormat,
  instant: number,
  expected: Readonly<{
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  }>,
): boolean {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return (
    Number(parts.year) === expected.year &&
    Number(parts.month) === expected.month &&
    Number(parts.day) === expected.day &&
    Number(parts.hour) === expected.hour &&
    Number(parts.minute) === expected.minute &&
    Number(parts.second) === 0
  );
}
