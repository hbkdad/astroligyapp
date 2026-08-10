import "server-only";

import {
  MemoryPublicDailyCache,
  PublicDailyReadingLoader,
  type PublicClock,
  type PublicDailyCache,
  type PublicDailyLoadResult,
  type PublicProviderExpectation,
} from "@/application/load-public-daily-readings";
import type { EphemerisProvider } from "@/domain/astro/contracts";
import {
  ASTRONOMY_ENGINE_POSITION_DATA_VERSION,
  ASTRONOMY_ENGINE_PROVIDER_ID,
  ASTRONOMY_ENGINE_PROVIDER_VERSION,
  AstronomyEngineProvider,
} from "@/infrastructure/ephemeris/astronomy-engine-provider";

export const PUBLIC_CURRENT_CACHE_TTL_MILLISECONDS = 15 * 60_000;
export const PUBLIC_CURRENT_CACHE_MAXIMUM_ENTRIES = 2;

export const PUBLIC_CURRENT_PROVIDER_EXPECTATION: PublicProviderExpectation =
  Object.freeze({
    id: ASTRONOMY_ENGINE_PROVIDER_ID,
    providerVersion: ASTRONOMY_ENGINE_PROVIDER_VERSION,
    dataVersion: ASTRONOMY_ENGINE_POSITION_DATA_VERSION,
  });

export class SystemUtcClock implements PublicClock {
  now(): Date {
    return new Date();
  }
}

export interface PublicDailyReadingLoaderFactoryOptions {
  readonly provider?: EphemerisProvider;
  readonly providerExpectation?: PublicProviderExpectation;
  readonly cache?: PublicDailyCache;
  readonly clock?: PublicClock;
  readonly cacheTtlMilliseconds?: number;
}

export function createPublicDailyReadingLoader(
  options: PublicDailyReadingLoaderFactoryOptions = {},
): PublicDailyReadingLoader {
  return new PublicDailyReadingLoader(
    options.provider ?? new AstronomyEngineProvider(),
    options.providerExpectation ?? PUBLIC_CURRENT_PROVIDER_EXPECTATION,
    options.cache ??
      new MemoryPublicDailyCache(PUBLIC_CURRENT_CACHE_MAXIMUM_ENTRIES),
    options.clock ?? new SystemUtcClock(),
    undefined,
    undefined,
    options.cacheTtlMilliseconds ?? PUBLIC_CURRENT_CACHE_TTL_MILLISECONDS,
  );
}

const currentPublicDailyReadingLoader = createPublicDailyReadingLoader();

export function loadCurrentPublicDailyReadings(): Promise<PublicDailyLoadResult> {
  return currentPublicDailyReadingLoader.loadCurrent();
}
