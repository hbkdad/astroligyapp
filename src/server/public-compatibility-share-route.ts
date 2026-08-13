import "server-only";

import { Pool } from "pg";

import {
  GLOBAL_BROWSER_SECURITY_HEADERS,
  PRIVATE_NO_STORE_HEADERS,
  STRICT_SHARE_CONTENT_SECURITY_POLICY,
} from "@/config/http-security";
import { renderPublicCompatibilityShareDocument } from "@/components/public-compatibility-share-document";
import { CompatibilityReportRepository } from "@/infrastructure/persistence/compatibility-report-repository";
import {
  toPublicCompatibilityShareReadModel,
  type PublicCompatibilityShareViewState,
} from "@/presentation/public-compatibility-share-read-model";
import type { PublicCompatibilitySharePayload } from "@/application/project-public-compatibility-share";

export const PUBLIC_SHARE_UNAVAILABLE_MESSAGE =
  "The link may be missing, expired, or no longer shared.";

export const PUBLIC_SHARE_RESPONSE_HEADERS = Object.freeze({
  ...PRIVATE_NO_STORE_HEADERS,
  ...GLOBAL_BROWSER_SECURITY_HEADERS,
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  "Content-Security-Policy": STRICT_SHARE_CONTENT_SECURITY_POLICY,
});

export interface PublicCompatibilityShareResolver {
  resolveActivePublic(
    token: string,
  ): Promise<PublicCompatibilitySharePayload | null>;
}

export type PublicShareGateResult<T> =
  Readonly<{ allowed: true; value: T }> | Readonly<{ allowed: false }>;

export interface PublicShareLookupGate {
  run<T>(work: () => Promise<T>): Promise<PublicShareGateResult<T>>;
}

export class BoundedPublicShareLookupGate implements PublicShareLookupGate {
  private active = 0;

  constructor(private readonly maximumConcurrentLookups: number) {
    if (
      !Number.isSafeInteger(maximumConcurrentLookups) ||
      maximumConcurrentLookups < 1 ||
      maximumConcurrentLookups > 64
    )
      throw new RangeError("Public share concurrency limit is invalid");
  }

  async run<T>(work: () => Promise<T>): Promise<PublicShareGateResult<T>> {
    if (this.active >= this.maximumConcurrentLookups)
      return Object.freeze({ allowed: false });
    this.active += 1;
    try {
      return Object.freeze({ allowed: true, value: await work() });
    } finally {
      this.active -= 1;
    }
  }
}

export async function loadPublicCompatibilityShare(
  token: string,
  dependencies: Readonly<{
    resolver: PublicCompatibilityShareResolver;
    gate: PublicShareLookupGate;
  }>,
): Promise<PublicCompatibilityShareViewState> {
  if (!canonicalToken(token)) return unavailable();
  try {
    const result = await dependencies.gate.run(() =>
      dependencies.resolver.resolveActivePublic(token),
    );
    if (!result.allowed || result.value === null) return unavailable();
    return Object.freeze({
      status: "ready" as const,
      model: toPublicCompatibilityShareReadModel(result.value),
    });
  } catch {
    return unavailable();
  }
}

export function createPublicCompatibilityShareHandler(
  dependencies: Readonly<{
    resolver: PublicCompatibilityShareResolver;
    gate: PublicShareLookupGate;
  }> = productionDependencies(),
) {
  return async function GET(
    _request: Request,
    context: Readonly<{ params: Promise<{ token: string }> }>,
  ): Promise<Response> {
    let state: PublicCompatibilityShareViewState;
    try {
      const { token } = await context.params;
      state = await loadPublicCompatibilityShare(token, dependencies);
    } catch {
      state = unavailable();
    }
    return createPublicCompatibilityShareResponse(state);
  };
}

export function createPublicCompatibilityShareResponse(
  state: PublicCompatibilityShareViewState,
): Response {
  return new Response(renderPublicCompatibilityShareDocument(state), {
    status: state.status === "ready" ? 200 : 404,
    headers: {
      ...PUBLIC_SHARE_RESPONSE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function unavailable(): PublicCompatibilityShareViewState {
  return Object.freeze({
    status: "unavailable" as const,
    message: PUBLIC_SHARE_UNAVAILABLE_MESSAGE,
  });
}

function canonicalToken(token: string): boolean {
  return (
    /^[A-Za-z0-9_-]{43}$/.test(token) &&
    Buffer.from(token, "base64url").toString("base64url") === token
  );
}

const productionGate = new BoundedPublicShareLookupGate(4);
let productionRepository: CompatibilityReportRepository | undefined;

function productionDependencies() {
  return {
    resolver: {
      resolveActivePublic(token: string) {
        return repository().resolveActivePublic(token);
      },
    },
    gate: productionGate,
  };
}

function repository(): CompatibilityReportRepository {
  if (productionRepository) return productionRepository;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith("postgresql://"))
    throw new Error("Public compatibility storage is unavailable");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
  });
  productionRepository = new CompatibilityReportRepository(pool);
  return productionRepository;
}
