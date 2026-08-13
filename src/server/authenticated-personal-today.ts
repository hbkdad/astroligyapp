import "server-only";

import type { AccountId } from "@/infrastructure/auth/account";
import {
  AuthenticationRequiredError,
  requireActiveSession,
  type ActiveSession,
  type SessionVerifier,
} from "@/infrastructure/auth/session";
import {
  PersonalTodayAuthorizationError,
  PersonalTodayConflictError,
  PersonalTodayLockedError,
  PersonalTodayUnavailableError,
  type PersonalTodayResult,
} from "@/infrastructure/persistence/personal-today-repository";
import { ProtectedNatalUnavailableError } from "@/infrastructure/persistence/protected-natal-chart-repository";
import type { DashboardReadModel } from "@/presentation/dashboard-read-model";
import {
  PERSONAL_TODAY_CONTRACT_VERSION,
  validatePersonalTodayCommand,
} from "@/server/personal-today-contracts";

export interface PersonalTodayDependencies {
  readonly sessionVerifier: SessionVerifier;
  readonly accountResolver: {
    resolveActiveAccount(session: ActiveSession): Promise<AccountId>;
  };
  readonly today: {
    load(ownerId: AccountId, command: unknown): Promise<PersonalTodayResult>;
  };
  readonly now?: () => Date;
}

export type PersonalTodayResponse =
  | Readonly<{
      version: typeof PERSONAL_TODAY_CONTRACT_VERSION;
      disposition: "ready";
      model: DashboardReadModel;
    }>
  | Readonly<{
      version: typeof PERSONAL_TODAY_CONTRACT_VERSION;
      disposition:
        | "authenticate"
        | "authorize"
        | "locked"
        | "conflict"
        | "incomplete"
        | "stale"
        | "unavailable"
        | "retry";
    }>;

export async function loadPersonalTodayForRequest(
  request: Request,
  commandValue: unknown,
  dependencies: PersonalTodayDependencies,
): Promise<PersonalTodayResponse> {
  let session: ActiveSession;
  try {
    session = await requireActiveSession(
      dependencies.sessionVerifier,
      request,
      dependencies.now,
    );
  } catch (error) {
    return response(
      error instanceof AuthenticationRequiredError ? "authenticate" : "retry",
    );
  }
  const command = validatePersonalTodayCommand(commandValue);
  if (!command) return response("authorize");
  let ownerId: AccountId;
  try {
    ownerId = await dependencies.accountResolver.resolveActiveAccount(session);
    if (!uuid(ownerId)) return response("retry");
  } catch {
    return response("retry");
  }
  try {
    const result = await dependencies.today.load(ownerId, command);
    if (result.outcome === "ready")
      return Object.freeze({
        version: PERSONAL_TODAY_CONTRACT_VERSION,
        disposition: "ready",
        model: result.model,
      });
    return response(result.outcome);
  } catch (error) {
    if (error instanceof PersonalTodayAuthorizationError)
      return response("authorize");
    if (error instanceof PersonalTodayConflictError)
      return response("conflict");
    if (error instanceof PersonalTodayLockedError) return response("locked");
    if (
      error instanceof PersonalTodayUnavailableError ||
      error instanceof ProtectedNatalUnavailableError
    )
      return response("unavailable");
    return response("retry");
  }
}

function response(
  disposition: Exclude<
    PersonalTodayResponse,
    { disposition: "ready" }
  >["disposition"],
): PersonalTodayResponse {
  return Object.freeze({
    version: PERSONAL_TODAY_CONTRACT_VERSION,
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
