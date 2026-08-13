import {
  DEFAULT_ASPECT_DEFINITIONS,
  MAJOR_ASPECT_POLICY_ID,
  MAJOR_ASPECT_POLICY_VERSION,
  validateAspectDefinitions,
  type AspectDefinition,
} from "@/domain/astro/aspects";
import type { EphemerisProvider } from "@/domain/astro/contracts";
import type { InterpretationLibrary } from "@/domain/interpretation/contracts";
import { PUBLIC_INTERPRETATION_LIBRARY } from "@/domain/interpretation/public-library";
import { LUNAR_PHASE_ENGINE_VERSION } from "@/domain/lunar/phase";
import { ZODIAC_SIGNS } from "@/domain/astro/zodiac";
import {
  PUBLIC_HOROSCOPE_READ_MODEL_VERSION,
  toPublicHoroscopeReadModel,
  type PublicHoroscopeReadModel,
} from "@/presentation/public-horoscope-read-model";
import {
  PUBLIC_DAILY_PROJECTION_VERSION,
  PUBLIC_DAILY_READING_VERSION,
  PUBLIC_DAILY_SKY_SAMPLE_CONVENTION,
  PUBLIC_SIGN_TARGET_CONVENTION,
  PublicDailyReadingEngine,
  type PublicDailyReadings,
} from "./compose-public-daily-readings";
import {
  recordCalculationPerformance,
  type CalculationPerformanceSink,
} from "./calculation-performance";

export const PUBLIC_DAILY_LOADER_VERSION = "1.0.0";
export const PUBLIC_DAILY_CACHE_ENTRY_VERSION = "1.0.0";

export interface PublicClock {
  now(): Date;
}

export interface PublicDailyCache {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PublicProviderExpectation {
  readonly id: string;
  readonly providerVersion: string;
  readonly dataVersion: string;
}

export type PublicDailyCacheStatus =
  | "hit"
  | "miss"
  | "coalesced"
  | "expired-regenerated"
  | "invalid-regenerated"
  | "write-skipped";

export interface LoadedPublicDailyReadings {
  readonly date: string;
  readonly aggregate: PublicDailyReadings;
  readonly models: readonly PublicHoroscopeReadModel[];
  readonly metadata: Readonly<{
    loaderVersion: string;
    cacheEntryVersion: string;
    cacheKey: string;
    cacheStatus: PublicDailyCacheStatus;
    loadedAt: string;
    expiresAt: string;
  }>;
}

export type PublicDailyLoadResult =
  | Readonly<{ ok: true; value: LoadedPublicDailyReadings }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "source-unavailable" | "cache-unavailable" | "invalid-clock";
        message: "Public daily reading is temporarily unavailable";
        retryable: boolean;
      }>;
    }>;

interface PublicDailyCacheEntry {
  readonly version: typeof PUBLIC_DAILY_CACHE_ENTRY_VERSION;
  readonly key: string;
  readonly date: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly aggregate: PublicDailyReadings;
}

type CacheInspection =
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "expired" | "invalid" }>
  | Readonly<{ status: "valid"; entry: PublicDailyCacheEntry }>;

export class PublicDailyReadingLoader {
  private readonly inFlight = new Map<string, Promise<PublicDailyLoadResult>>();
  private readonly aspectDefinitions: readonly AspectDefinition[];

  constructor(
    private readonly provider: EphemerisProvider,
    private readonly providerExpectation: PublicProviderExpectation,
    private readonly cache: PublicDailyCache,
    private readonly clock: PublicClock,
    private readonly library: InterpretationLibrary = PUBLIC_INTERPRETATION_LIBRARY,
    aspectDefinitions: readonly AspectDefinition[] = DEFAULT_ASPECT_DEFINITIONS,
    private readonly cacheTtlMilliseconds = 15 * 60_000,
    private readonly performanceSink?: CalculationPerformanceSink,
    private readonly monotonicNow: () => number = () => performance.now(),
  ) {
    validateProviderExpectation(provider, providerExpectation);
    validateAspectDefinitions(aspectDefinitions);
    if (
      !Number.isInteger(cacheTtlMilliseconds) ||
      cacheTtlMilliseconds < 60_000 ||
      cacheTtlMilliseconds > 86_400_000
    )
      throw new RangeError(
        "Public cache TTL must be between one minute and one day",
      );
    this.aspectDefinitions = deepFreeze(structuredClone(aspectDefinitions));
  }

  async loadCurrent(): Promise<PublicDailyLoadResult> {
    const startedAt = safeMonotonicNow(this.monotonicNow);
    const result = await this.loadCurrentUnmeasured();
    recordCalculationPerformance(this.performanceSink, {
      flow: "public-daily",
      outcome: result.ok
        ? result.value.metadata.cacheStatus
        : result.error.code,
      durationMilliseconds: elapsedMilliseconds(
        startedAt,
        safeMonotonicNow(this.monotonicNow),
      ),
    });
    return result;
  }

  private async loadCurrentUnmeasured(): Promise<PublicDailyLoadResult> {
    const now = this.clock.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
      return loadFailure("invalid-clock", false);
    const loadedAt = now.toISOString();
    const date = loadedAt.slice(0, 10);
    const cacheKey = this.cacheKeyForDate(date);
    const pending = this.inFlight.get(cacheKey);
    if (pending) {
      const result = await pending;
      return result.ok ? successWithStatus(result.value, "coalesced") : result;
    }
    const load = this.loadDate(date, loadedAt, cacheKey);
    this.inFlight.set(cacheKey, load);
    try {
      return await load;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  cacheKeyForDate(date: string): string {
    if (!validPlainDate(date))
      throw new RangeError("Invalid public cache date");
    const aspects = this.aspectDefinitions
      .map(
        (item) =>
          `${item.type}:${item.exactAngleDegrees}:${item.maximumOrbDegrees}`,
      )
      .join(",");
    return [
      "public-daily",
      `loader=${PUBLIC_DAILY_LOADER_VERSION}`,
      `entry=${PUBLIC_DAILY_CACHE_ENTRY_VERSION}`,
      `ttlMs=${this.cacheTtlMilliseconds}`,
      `date=${date}`,
      `provider=${encoded(this.providerExpectation.id)}`,
      `providerVersion=${encoded(this.providerExpectation.providerVersion)}`,
      `dataVersion=${encoded(this.providerExpectation.dataVersion)}`,
      `aggregate=${PUBLIC_DAILY_READING_VERSION}`,
      `readModel=${PUBLIC_HOROSCOPE_READ_MODEL_VERSION}`,
      `projection=${PUBLIC_DAILY_PROJECTION_VERSION}`,
      `lunar=${LUNAR_PHASE_ENGINE_VERSION}`,
      `sample=${PUBLIC_DAILY_SKY_SAMPLE_CONVENTION}`,
      `target=${PUBLIC_SIGN_TARGET_CONVENTION}`,
      `aspectPolicy=${MAJOR_ASPECT_POLICY_ID}:${MAJOR_ASPECT_POLICY_VERSION}`,
      `aspects=${encoded(aspects)}`,
      `library=${encoded(this.library.id)}:${encoded(this.library.version)}:${encoded(this.library.locale)}`,
    ].join("|");
  }

  private async loadDate(
    date: string,
    loadedAt: string,
    cacheKey: string,
  ): Promise<PublicDailyLoadResult> {
    let cached: unknown | null;
    try {
      cached = await this.cache.get(cacheKey);
    } catch {
      return loadFailure("cache-unavailable", true);
    }
    const inspection = inspectCacheEntry(
      cached,
      cacheKey,
      date,
      loadedAt,
      this.cacheTtlMilliseconds,
    );
    if (inspection.status === "valid")
      return buildSuccess(
        deepFreeze(inspection.entry.aggregate),
        cacheKey,
        "hit",
        loadedAt,
        inspection.entry.expiresAt,
      );
    if (inspection.status === "expired" || inspection.status === "invalid") {
      try {
        await this.cache.delete(cacheKey);
      } catch {
        return loadFailure("cache-unavailable", true);
      }
    }

    const result = await new PublicDailyReadingEngine(
      this.provider,
      this.library,
      this.aspectDefinitions,
    ).calculate({ date });
    if (!result.ok || !this.matchesExpectedProvider(result.value))
      return loadFailure(
        "source-unavailable",
        !result.ok && result.error.retryable,
      );

    const expiresAt = expiryFor(date, loadedAt, this.cacheTtlMilliseconds);
    const cacheEntry: PublicDailyCacheEntry = {
      version: PUBLIC_DAILY_CACHE_ENTRY_VERSION,
      key: cacheKey,
      date,
      createdAt: loadedAt,
      expiresAt,
      aggregate: result.value,
    };
    let status: PublicDailyCacheStatus =
      inspection.status === "expired"
        ? "expired-regenerated"
        : inspection.status === "invalid"
          ? "invalid-regenerated"
          : "miss";
    try {
      await this.cache.set(cacheKey, cacheEntry);
    } catch {
      status = "write-skipped";
    }
    return buildSuccess(result.value, cacheKey, status, loadedAt, expiresAt);
  }

  private matchesExpectedProvider(aggregate: PublicDailyReadings): boolean {
    const metadata = aggregate.sky.metadata;
    return (
      metadata.providerId === this.providerExpectation.id &&
      metadata.providerVersion === this.providerExpectation.providerVersion &&
      metadata.dataVersion === this.providerExpectation.dataVersion
    );
  }
}

function safeMonotonicNow(clock: () => number): number {
  try {
    const value = clock();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function elapsedMilliseconds(start: number, end: number): number {
  return end >= start ? end - start : 0;
}

export class MemoryPublicDailyCache implements PublicDailyCache {
  private readonly entries = new Map<string, unknown>();

  constructor(readonly maximumEntries = 8) {
    if (
      !Number.isInteger(maximumEntries) ||
      maximumEntries < 1 ||
      maximumEntries > 64
    )
      throw new RangeError("Public cache size must be between 1 and 64");
  }

  get size(): number {
    return this.entries.size;
  }

  async get(key: string): Promise<unknown | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maximumEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

function inspectCacheEntry(
  candidate: unknown | null,
  key: string,
  date: string,
  loadedAt: string,
  ttlMilliseconds: number,
): CacheInspection {
  if (candidate === null) return { status: "missing" };
  if (!isRecord(candidate)) return { status: "invalid" };
  const expectedKeys = [
    "version",
    "key",
    "date",
    "createdAt",
    "expiresAt",
    "aggregate",
  ];
  const createdAt =
    typeof candidate.createdAt === "string"
      ? Date.parse(candidate.createdAt)
      : Number.NaN;
  const expiresAt =
    typeof candidate.expiresAt === "string"
      ? Date.parse(candidate.expiresAt)
      : Number.NaN;
  if (
    Object.keys(candidate).length !== expectedKeys.length ||
    expectedKeys.some((item) => !Object.hasOwn(candidate, item)) ||
    candidate.version !== PUBLIC_DAILY_CACHE_ENTRY_VERSION ||
    candidate.key !== key ||
    candidate.date !== date ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    candidate.createdAt.slice(0, 10) !== date ||
    createdAt > Date.parse(loadedAt) ||
    expiresAt <= createdAt ||
    candidate.expiresAt !==
      expiryFor(date, candidate.createdAt, ttlMilliseconds) ||
    !isRecord(candidate.aggregate)
  )
    return { status: "invalid" };
  if (expiresAt <= Date.parse(loadedAt)) return { status: "expired" };
  try {
    for (const sign of ZODIAC_SIGNS)
      toPublicHoroscopeReadModel(
        candidate.aggregate as unknown as PublicDailyReadings,
        sign,
      );
  } catch {
    return { status: "invalid" };
  }
  return {
    status: "valid",
    entry: candidate as unknown as PublicDailyCacheEntry,
  };
}

function buildSuccess(
  aggregate: PublicDailyReadings,
  cacheKey: string,
  cacheStatus: PublicDailyCacheStatus,
  loadedAt: string,
  expiresAt: string,
): PublicDailyLoadResult {
  const models = ZODIAC_SIGNS.map((sign) =>
    toPublicHoroscopeReadModel(aggregate, sign),
  );
  return {
    ok: true,
    value: deepFreeze({
      date: aggregate.date,
      aggregate,
      models,
      metadata: {
        loaderVersion: PUBLIC_DAILY_LOADER_VERSION,
        cacheEntryVersion: PUBLIC_DAILY_CACHE_ENTRY_VERSION,
        cacheKey,
        cacheStatus,
        loadedAt,
        expiresAt,
      },
    }),
  };
}

function successWithStatus(
  value: LoadedPublicDailyReadings,
  cacheStatus: PublicDailyCacheStatus,
): PublicDailyLoadResult {
  return {
    ok: true,
    value: deepFreeze({
      ...value,
      metadata: { ...value.metadata, cacheStatus },
    }),
  };
}

function loadFailure(
  code: "source-unavailable" | "cache-unavailable" | "invalid-clock",
  retryable: boolean,
): PublicDailyLoadResult {
  return {
    ok: false,
    error: {
      code,
      message: "Public daily reading is temporarily unavailable",
      retryable,
    },
  };
}

function validateProviderExpectation(
  provider: EphemerisProvider,
  expectation: PublicProviderExpectation,
): void {
  if (
    provider.id !== expectation.id ||
    !validText(expectation.id) ||
    !validText(expectation.providerVersion) ||
    !validText(expectation.dataVersion)
  )
    throw new RangeError("Public provider expectation is invalid");
}

function expiryFor(
  date: string,
  loadedAt: string,
  ttlMilliseconds: number,
): string {
  const nextDate = Date.parse(`${date}T00:00:00Z`) + 86_400_000;
  return new Date(
    Math.min(nextDate, Date.parse(loadedAt) + ttlMilliseconds),
  ).toISOString();
}

function validPlainDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function validText(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 256 && !/[\r\n|]/.test(value);
}

function encoded(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
