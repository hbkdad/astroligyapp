import "server-only";

import type { AccountId } from "@/infrastructure/auth/account";
import type { ProtectedNatalChartProfileView } from "@/presentation/protected-natal-chart-state";
import {
  AuthenticationRequiredError,
  requireActiveSession,
  type ActiveSession,
  type SessionVerifier,
} from "@/infrastructure/auth/session";
import {
  ProtectedNatalAuthorizationError,
  ProtectedNatalConflictError,
  ProtectedNatalLockedError,
  ProtectedNatalUnavailableError,
  type ProtectedNatalGenerationResult,
} from "@/infrastructure/persistence/protected-natal-chart-repository";
import {
  PROTECTED_NATAL_CHART_CONTRACT_VERSION,
  validateProtectedNatalChartCommand,
} from "@/server/protected-natal-chart-contracts";

export interface ProtectedNatalAccountResolver {
  resolveActiveAccount(session: ActiveSession): Promise<AccountId>;
}

export interface ProtectedNatalStore {
  list(ownerId: AccountId): Promise<readonly ProtectedNatalChartProfileView[]>;
  generate(
    ownerId: AccountId,
    command: unknown,
  ): Promise<ProtectedNatalGenerationResult>;
}

export type ProtectedNatalReadResult =
  | Readonly<{
      version: typeof PROTECTED_NATAL_CHART_CONTRACT_VERSION;
      disposition: "ready";
      profiles: readonly ProtectedNatalChartProfileView[];
    }>
  | Readonly<{
      version: typeof PROTECTED_NATAL_CHART_CONTRACT_VERSION;
      disposition: "authenticate" | "retry";
    }>;

export async function loadProtectedNatalChartsForRequest(
  request: Request,
  dependencies: AuthenticatedProtectedNatalDependencies,
): Promise<ProtectedNatalReadResult> {
  const authorization = await authorizedOwner(request, dependencies);
  if (!authorization.ok)
    return Object.freeze({
      version: PROTECTED_NATAL_CHART_CONTRACT_VERSION,
      disposition: authorization.disposition,
    });
  try {
    return Object.freeze({
      version: PROTECTED_NATAL_CHART_CONTRACT_VERSION,
      disposition: "ready" as const,
      profiles: Object.freeze([
        ...(await dependencies.charts.list(authorization.ownerId)),
      ]),
    });
  } catch {
    return Object.freeze({
      version: PROTECTED_NATAL_CHART_CONTRACT_VERSION,
      disposition: "retry" as const,
    });
  }
}

export interface AuthenticatedProtectedNatalDependencies {
  readonly sessionVerifier: SessionVerifier;
  readonly accountResolver: ProtectedNatalAccountResolver;
  readonly charts: ProtectedNatalStore;
  readonly now?: () => Date;
}

export type ProtectedNatalMutationResult = Readonly<{
  version: typeof PROTECTED_NATAL_CHART_CONTRACT_VERSION;
  disposition:
    | ProtectedNatalGenerationResult["outcome"]
    | "authenticate"
    | "authorize"
    | "locked"
    | "conflict"
    | "unavailable"
    | "retry";
}>;

export async function generateProtectedNatalChartForRequest(
  request: Request,
  commandValue: unknown,
  dependencies: AuthenticatedProtectedNatalDependencies,
): Promise<ProtectedNatalMutationResult> {
  const authorization = await authorizedOwner(request, dependencies);
  if (!authorization.ok) return result(authorization.disposition);
  const command = validateProtectedNatalChartCommand(commandValue);
  if (!command) return result("authorize");
  try {
    return result(
      (await dependencies.charts.generate(authorization.ownerId, command))
        .outcome,
    );
  } catch (error) {
    if (error instanceof ProtectedNatalLockedError) return result("locked");
    if (error instanceof ProtectedNatalConflictError) return result("conflict");
    if (error instanceof ProtectedNatalAuthorizationError)
      return result("authorize");
    if (error instanceof ProtectedNatalUnavailableError)
      return result("unavailable");
    return result("retry");
  }
}

async function authorizedOwner(
  request: Request,
  dependencies: AuthenticatedProtectedNatalDependencies,
): Promise<
  | Readonly<{ ok: true; ownerId: AccountId }>
  | Readonly<{ ok: false; disposition: "authenticate" | "retry" }>
> {
  let session: ActiveSession;
  try {
    session = await requireActiveSession(
      dependencies.sessionVerifier,
      request,
      dependencies.now,
    );
  } catch (error) {
    return Object.freeze({
      ok: false,
      disposition:
        error instanceof AuthenticationRequiredError ? "authenticate" : "retry",
    });
  }
  try {
    const ownerId =
      await dependencies.accountResolver.resolveActiveAccount(session);
    return uuid(ownerId)
      ? Object.freeze({ ok: true, ownerId })
      : Object.freeze({ ok: false, disposition: "retry" as const });
  } catch {
    return Object.freeze({ ok: false, disposition: "retry" });
  }
}

function result(
  disposition: ProtectedNatalMutationResult["disposition"],
): ProtectedNatalMutationResult {
  return Object.freeze({
    version: PROTECTED_NATAL_CHART_CONTRACT_VERSION,
    disposition,
  });
}

function uuid(value: unknown): value is AccountId {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
