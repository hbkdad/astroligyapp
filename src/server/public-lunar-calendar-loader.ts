import "server-only";

import {
  PUBLIC_LUNAR_CALENDAR_VERSION,
  PUBLIC_LUNAR_MAX_REFINEMENT_ITERATIONS,
  PUBLIC_LUNAR_REFINEMENT_TOLERANCE_SECONDS,
  PUBLIC_LUNAR_SAMPLE_STEP_SECONDS,
  PublicLunarCalendarEngine,
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

export const PUBLIC_LUNAR_LOADER_VERSION = "1.0.0";
export const PUBLIC_LUNAR_CACHE_TTL_MILLISECONDS = 6 * 60 * 60_000;

type LoadResult =
  | Readonly<{
      ok: true;
      value: PublicLunarCalendar;
      cacheStatus: "hit" | "miss" | "coalesced";
    }>
  | Readonly<{ ok: false; reason: "invalid-date" | "source-unavailable" }>;

interface Entry {
  readonly expiresAt: number;
  readonly value: PublicLunarCalendar;
}

export class PublicLunarCalendarLoader {
  private readonly cache = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<LoadResult>>();

  constructor(
    private readonly engine: Pick<
      PublicLunarCalendarEngine,
      "calculate"
    > = new PublicLunarCalendarEngine(new AstronomyEngineProvider()),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async load(date: string): Promise<LoadResult> {
    const now = this.now();
    if (!publicLunarDateWindow(date, now))
      return { ok: false, reason: "invalid-date" };
    const key = this.cacheKey(date);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now.getTime())
      return { ok: true, value: cached.value, cacheStatus: "hit" };
    this.cache.delete(key);
    const pending = this.inFlight.get(key);
    if (pending) {
      const result = await pending;
      return result.ok ? { ...result, cacheStatus: "coalesced" } : result;
    }
    const loading = this.calculate(date, key, now);
    this.inFlight.set(key, loading);
    try {
      return await loading;
    } finally {
      this.inFlight.delete(key);
    }
  }

  cacheKey(date: string) {
    return [
      "public-lunar",
      `loader=${PUBLIC_LUNAR_LOADER_VERSION}`,
      `calendar=${PUBLIC_LUNAR_CALENDAR_VERSION}`,
      `phase=${LUNAR_PHASE_ENGINE_VERSION}`,
      `search=${LUNAR_EVENT_SEARCH_VERSION}`,
      `sample=${PUBLIC_LUNAR_SAMPLE_STEP_SECONDS}`,
      `tolerance=${PUBLIC_LUNAR_REFINEMENT_TOLERANCE_SECONDS}`,
      `iterations=${PUBLIC_LUNAR_MAX_REFINEMENT_ITERATIONS}`,
      `date=${date}`,
      `provider=${ASTRONOMY_ENGINE_PROVIDER_ID}`,
      `providerVersion=${ASTRONOMY_ENGINE_PROVIDER_VERSION}`,
      `dataVersion=${ASTRONOMY_ENGINE_POSITION_DATA_VERSION}`,
    ].join("|");
  }

  private async calculate(
    date: string,
    key: string,
    now: Date,
  ): Promise<LoadResult> {
    const result = await this.engine.calculate(date);
    if (!result.ok || result.value.date !== date)
      return { ok: false, reason: "source-unavailable" };
    this.cache.set(key, {
      expiresAt: now.getTime() + PUBLIC_LUNAR_CACHE_TTL_MILLISECONDS,
      value: result.value,
    });
    while (this.cache.size > 40)
      this.cache.delete(this.cache.keys().next().value!);
    return { ok: true, value: result.value, cacheStatus: "miss" };
  }
}

const loader = new PublicLunarCalendarLoader();
export function loadPublicLunarCalendar(date: string) {
  return loader.load(date);
}
