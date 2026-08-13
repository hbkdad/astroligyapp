import type {
  CelestialBody,
  CelestialPosition,
  EphemerisProvider,
  EphemerisProviderResult,
  HouseRequest,
  HouseResult,
  PositionRequest,
  PositionResult,
  ProviderMetadata,
} from "@/domain/astro/contracts";

interface PositionCacheEntry {
  readonly positions: Map<CelestialBody, CelestialPosition>;
  metadata?: ProviderMetadata;
}

/**
 * Request-local provider wrapper. It reuses validated position observations at
 * one instant/location across event searches and never persists private data.
 */
export class MemoizedEphemerisProvider implements EphemerisProvider {
  readonly id: string;
  private readonly positions = new Map<string, PositionCacheEntry>();
  private positionCalls = 0;

  constructor(private readonly provider: EphemerisProvider) {
    this.id = provider.id;
  }

  get providerPositionCallCount(): number {
    return this.positionCalls;
  }

  async getPositions(
    request: PositionRequest,
  ): Promise<EphemerisProviderResult<PositionResult>> {
    const key = baseKey(request);
    const entry = this.positions.get(key) ?? {
      positions: new Map<CelestialBody, CelestialPosition>(),
    };
    const cached = request.bodies.map((body) => entry.positions.get(body));
    if (entry.metadata && cached.every(Boolean)) {
      return {
        ok: true,
        value: {
          instant: request.instant,
          positions: cached as CelestialPosition[],
          metadata: entry.metadata,
        },
      };
    }

    this.positionCalls += 1;
    const missing = request.bodies.filter((body) => !entry.positions.has(body));
    const result = await this.provider.getPositions({
      ...request,
      bodies: missing.length ? missing : request.bodies,
    });
    if (!result.ok) return result;
    entry.metadata ??= result.value.metadata;
    if (!sameTrace(entry.metadata, result.value.metadata)) {
      return {
        ok: false,
        error: {
          code: "invalid-provider-response",
          message:
            "Ephemeris provider trace changed inside one observation cache",
          retryable: false,
        },
      };
    }
    for (const position of result.value.positions)
      entry.positions.set(position.body, position);
    this.positions.set(key, entry);
    const projected = request.bodies.map((body) => entry.positions.get(body));
    if (projected.some((position) => position === undefined)) {
      return {
        ok: false,
        error: {
          code: "invalid-provider-response",
          message: "Ephemeris provider omitted a requested cached body",
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      value: {
        instant: request.instant,
        positions: projected as CelestialPosition[],
        metadata: entry.metadata,
      },
    };
  }

  getHouseCusps(
    request: HouseRequest,
  ): Promise<EphemerisProviderResult<HouseResult>> {
    return this.provider.getHouseCusps(request);
  }
}

function baseKey(request: PositionRequest): string {
  return JSON.stringify({
    instant: request.instant,
    observer: request.observer ?? null,
    zodiacReference: request.zodiacReference,
    coordinateOrigin: request.coordinateOrigin,
  });
}

function sameTrace(left: ProviderMetadata, right: ProviderMetadata) {
  return (
    left.providerId === right.providerId &&
    left.providerVersion === right.providerVersion &&
    left.dataVersion === right.dataVersion &&
    left.timeScale === right.timeScale &&
    left.referenceFrame === right.referenceFrame &&
    left.zodiacReference === right.zodiacReference &&
    left.coordinateOrigin === right.coordinateOrigin
  );
}
