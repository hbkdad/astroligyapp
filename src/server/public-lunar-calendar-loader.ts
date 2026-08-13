import "server-only";

import {
  recordCalculationPerformance,
  type CalculationPerformanceSink,
} from "@/application/calculation-performance";
import {
  PUBLIC_LUNAR_CALENDAR_VERSION,
  PUBLIC_LUNAR_MAX_REFINEMENT_ITERATIONS,
  PUBLIC_LUNAR_REFINEMENT_TOLERANCE_SECONDS,
  PUBLIC_LUNAR_SAMPLE_STEP_SECONDS,
  PublicLunarCalendarEngine,
  plainDateEpoch,
  type PublicLunarCalendar,
} from "@/application/calculate-public-lunar-calendar";
import { LUNAR_EVENT_SEARCH_VERSION } from "@/application/search-lunar-events";
import { LUNAR_PHASE_ENGINE_VERSION } from "@/domain/lunar/phase";
import {
  ASTRONOMY_ENGINE_POSITION_DATA_VERSION,
  ASTRONOMY_ENGINE_PROVIDER_ID,
  ASTRONOMY_ENGINE_PROVIDER_VERSION,
  AstronomyEngineProvider,
} from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { publicLunarDateWindow } from "@/presentation/public-lunar-date";
import { toPublicLunarCalendarReadModel } from "@/presentation/public-lunar-calendar-read-model";

export const PUBLIC_LUNAR_LOADER_VERSION = "1.1.0";
export const PUBLIC_LUNAR_CACHE_ENTRY_VERSION = "1.0.0";
export const PUBLIC_LUNAR_CACHE_TTL_MILLISECONDS = 6 * 60 * 60_000;
export const PUBLIC_LUNAR_CACHE_MAXIMUM_ENTRIES = 40;

export interface PublicLunarCache {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export type PublicLunarCacheStatus =
  | "hit"
  | "miss"
  | "coalesced"
  | "expired-regenerated"
  | "invalid-regenerated"
  | "write-skipped";

export type PublicLunarLoadResult =
  | Readonly<{
      ok: true;
      value: PublicLunarCalendar;
      cacheStatus: PublicLunarCacheStatus;
    }>
  | Readonly<{
      ok: false;
      reason:
        | "invalid-date"
        | "invalid-clock"
        | "source-unavailable"
        | "cache-unavailable";
    }>;

interface PublicLunarCacheEntry {
  readonly version: typeof PUBLIC_LUNAR_CACHE_ENTRY_VERSION;
  readonly key: string;
  readonly date: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly value: PublicLunarCalendar;
}

type CacheInspection =
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "expired" | "invalid" }>
  | Readonly<{ status: "valid"; entry: PublicLunarCacheEntry }>;

export class PublicLunarCalendarLoader {
  private readonly inFlight = new Map<string, Promise<PublicLunarLoadResult>>();

  constructor(
    private readonly engine: Pick<
      PublicLunarCalendarEngine,
      "calculate"
    > = new PublicLunarCalendarEngine(new AstronomyEngineProvider()),
    private readonly now: () => Date = () => new Date(),
    private readonly cache: PublicLunarCache = new MemoryPublicLunarCache(),
    private readonly cacheTtlMilliseconds = PUBLIC_LUNAR_CACHE_TTL_MILLISECONDS,
    private readonly performanceSink?: CalculationPerformanceSink,
    private readonly monotonicNow: () => number = () => performance.now(),
  ) {
    if (
      !Number.isInteger(cacheTtlMilliseconds) ||
      cacheTtlMilliseconds < 60_000 ||
      cacheTtlMilliseconds > 86_400_000
    )
      throw new RangeError(
        "Public lunar cache TTL must be between one minute and one day",
      );
  }

  async load(date: string): Promise<PublicLunarLoadResult> {
    const startedAt = safeMonotonicNow(this.monotonicNow);
    const result = await this.loadUnmeasured(date);
    const outcome = result.ok ? result.cacheStatus : result.reason;
    const providerPositionCallCount =
      result.ok && !["hit", "coalesced"].includes(result.cacheStatus)
        ? result.value.metadata.providerPositionCallCount
        : undefined;
    recordCalculationPerformance(this.performanceSink, {
      flow: "public-lunar",
      outcome,
      durationMilliseconds: elapsedMilliseconds(
        startedAt,
        safeMonotonicNow(this.monotonicNow),
      ),
      ...(providerPositionCallCount === undefined
        ? {}
        : { providerPositionCallCount }),
    });
    return result;
  }

  cacheKey(date: string): string {
    try {
      plainDateEpoch(date);
    } catch {
      throw new RangeError("Invalid public lunar cache date");
    }
    return [
      "public-lunar",
      `loader=${PUBLIC_LUNAR_LOADER_VERSION}`,
      `entry=${PUBLIC_LUNAR_CACHE_ENTRY_VERSION}`,
      `calendar=${PUBLIC_LUNAR_CALENDAR_VERSION}`,
      `phase=${LUNAR_PHASE_ENGINE_VERSION}`,
      `search=${LUNAR_EVENT_SEARCH_VERSION}`,
      `sample=${PUBLIC_LUNAR_SAMPLE_STEP_SECONDS}`,
      `tolerance=${PUBLIC_LUNAR_REFINEMENT_TOLERANCE_SECONDS}`,
      `iterations=${PUBLIC_LUNAR_MAX_REFINEMENT_ITERATIONS}`,
      `ttlMs=${this.cacheTtlMilliseconds}`,
      `date=${date}`,
      `provider=${ASTRONOMY_ENGINE_PROVIDER_ID}`,
      `providerVersion=${ASTRONOMY_ENGINE_PROVIDER_VERSION}`,
      `dataVersion=${ASTRONOMY_ENGINE_POSITION_DATA_VERSION}`,
    ].join("|");
  }

  private async loadUnmeasured(date: string): Promise<PublicLunarLoadResult> {
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
      return { ok: false, reason: "invalid-clock" };
    const window = publicLunarDateWindow(date, now);
    if (!window) return { ok: false, reason: "invalid-date" };
    const key = this.cacheKey(date);
    const pending = this.inFlight.get(key);
    if (pending) {
      const result = await pending;
      return result.ok ? { ...result, cacheStatus: "coalesced" } : result;
    }
    const loading = this.loadDate(date, key, now, window);
    this.inFlight.set(key, loading);
    try {
      return await loading;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async loadDate(
    date: string,
    key: string,
    now: Date,
    window: NonNullable<ReturnType<typeof publicLunarDateWindow>>,
  ): Promise<PublicLunarLoadResult> {
    let cached: unknown | null;
    try {
      cached = await this.cache.get(key);
    } catch {
      return { ok: false, reason: "cache-unavailable" };
    }
    const inspection = inspectCacheEntry(
      cached,
      key,
      date,
      now,
      window,
      this.cacheTtlMilliseconds,
    );
    if (inspection.status === "valid")
      return { ok: true, value: inspection.entry.value, cacheStatus: "hit" };
    if (inspection.status === "expired" || inspection.status === "invalid") {
      try {
        await this.cache.delete(key);
      } catch {
        return { ok: false, reason: "cache-unavailable" };
      }
    }
    const result = await this.engine.calculate(date);
    if (!result.ok || result.value.date !== date)
      return { ok: false, reason: "source-unavailable" };
    try {
      toPublicLunarCalendarReadModel(result.value, window);
    } catch {
      return { ok: false, reason: "source-unavailable" };
    }
    const createdAt = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + this.cacheTtlMilliseconds,
    ).toISOString();
    const entry: PublicLunarCacheEntry = deepFreeze({
      version: PUBLIC_LUNAR_CACHE_ENTRY_VERSION,
      key,
      date,
      createdAt,
      expiresAt,
      value: result.value,
    });
    let cacheStatus: PublicLunarCacheStatus =
      inspection.status === "expired"
        ? "expired-regenerated"
        : inspection.status === "invalid"
          ? "invalid-regenerated"
          : "miss";
    try {
      await this.cache.set(key, entry);
    } catch {
      cacheStatus = "write-skipped";
    }
    return { ok: true, value: result.value, cacheStatus };
  }
}

export class MemoryPublicLunarCache implements PublicLunarCache {
  private readonly entries = new Map<string, unknown>();

  constructor(readonly maximumEntries = PUBLIC_LUNAR_CACHE_MAXIMUM_ENTRIES) {
    if (
      !Number.isInteger(maximumEntries) ||
      maximumEntries < 1 ||
      maximumEntries > PUBLIC_LUNAR_CACHE_MAXIMUM_ENTRIES
    )
      throw new RangeError("Public lunar cache size must be between 1 and 40");
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
  now: Date,
  window: NonNullable<ReturnType<typeof publicLunarDateWindow>>,
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
    "value",
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
    expectedKeys.some((field) => !Object.hasOwn(candidate, field)) ||
    candidate.version !== PUBLIC_LUNAR_CACHE_ENTRY_VERSION ||
    candidate.key !== key ||
    candidate.date !== date ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    createdAt > now.getTime() ||
    expiresAt !== createdAt + ttlMilliseconds ||
    !isRecord(candidate.value)
  )
    return { status: "invalid" };
  if (expiresAt <= now.getTime()) return { status: "expired" };
  const value = candidate.value as unknown as PublicLunarCalendar;
  if (
    value.metadata?.provider?.providerId !== ASTRONOMY_ENGINE_PROVIDER_ID ||
    value.metadata?.provider?.providerVersion !==
      ASTRONOMY_ENGINE_PROVIDER_VERSION ||
    value.metadata?.provider?.dataVersion !==
      ASTRONOMY_ENGINE_POSITION_DATA_VERSION
  )
    return { status: "invalid" };
  try {
    toPublicLunarCalendarReadModel(value, window);
  } catch {
    return { status: "invalid" };
  }
  return {
    status: "valid",
    entry: candidate as unknown as PublicLunarCacheEntry,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const loader = new PublicLunarCalendarLoader();
export function loadPublicLunarCalendar(date: string) {
  return loader.load(date);
}
