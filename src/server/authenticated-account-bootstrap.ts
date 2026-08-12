import "server-only";

import type { AccountId } from "@/infrastructure/auth/account";
import {
  AuthenticationRequiredError,
  requireActiveSession,
  type ActiveSession,
  type SessionVerifier,
} from "@/infrastructure/auth/session";

export const AUTHENTICATED_ACCOUNT_BOOTSTRAP_VERSION = "1.0.0";

export interface AccountBootstrapper {
  bootstrap(session: ActiveSession): Promise<AccountId>;
}

export interface ActiveAccountResolver {
  resolveActiveAccount(session: ActiveSession): Promise<AccountId>;
}

export interface AccountReadinessVerifier {
  verify(ownerId: AccountId): Promise<boolean>;
}

export interface AuthenticatedAccountBootstrapDependencies {
  readonly sessionVerifier: SessionVerifier;
  readonly bootstrapper: AccountBootstrapper;
  readonly accountResolver: ActiveAccountResolver;
  readonly readinessVerifier: AccountReadinessVerifier;
  readonly now?: () => Date;
}

export type AuthenticatedAccountBootstrapResult =
  | Readonly<{
      version: typeof AUTHENTICATED_ACCOUNT_BOOTSTRAP_VERSION;
      disposition: "ready";
      code: "account-ready";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_ACCOUNT_BOOTSTRAP_VERSION;
      disposition: "authenticate";
      code: "authentication-required";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_ACCOUNT_BOOTSTRAP_VERSION;
      disposition: "retry";
      code:
        | "authentication-unavailable"
        | "bootstrap-unavailable"
        | "account-unavailable"
        | "identity-boundary-unavailable";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_ACCOUNT_BOOTSTRAP_VERSION;
      disposition: "reconcile";
      code: "account-identity-mismatch";
    }>;

export async function bootstrapAccountForRequest(
  request: Request,
  dependencies: AuthenticatedAccountBootstrapDependencies,
): Promise<AuthenticatedAccountBootstrapResult> {
  let session: ActiveSession;
  try {
    session = await requireActiveSession(
      dependencies.sessionVerifier,
      request,
      dependencies.now,
    );
  } catch (error) {
    return error instanceof AuthenticationRequiredError
      ? result("authenticate", "authentication-required")
      : result("retry", "authentication-unavailable");
  }

  let bootstrapped: AccountId;
  try {
    bootstrapped = await dependencies.bootstrapper.bootstrap(session);
  } catch {
    return result("retry", "bootstrap-unavailable");
  }
  if (!uuid(bootstrapped)) return result("retry", "bootstrap-unavailable");

  let active: AccountId;
  try {
    active = await dependencies.accountResolver.resolveActiveAccount(session);
  } catch {
    return result("retry", "account-unavailable");
  }
  if (!uuid(active)) return result("retry", "account-unavailable");
  if (active !== bootstrapped)
    return result("reconcile", "account-identity-mismatch");

  try {
    if (!(await dependencies.readinessVerifier.verify(active)))
      return result("retry", "identity-boundary-unavailable");
  } catch {
    return result("retry", "identity-boundary-unavailable");
  }
  return result("ready", "account-ready");
}

function uuid(value: unknown): value is AccountId {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function result<
  D extends AuthenticatedAccountBootstrapResult["disposition"],
  C extends Extract<
    AuthenticatedAccountBootstrapResult,
    { disposition: D }
  >["code"],
>(
  disposition: D,
  code: C,
): Extract<AuthenticatedAccountBootstrapResult, { disposition: D }> {
  return Object.freeze({
    version: AUTHENTICATED_ACCOUNT_BOOTSTRAP_VERSION,
    disposition,
    code,
  }) as unknown as Extract<
    AuthenticatedAccountBootstrapResult,
    { disposition: D }
  >;
}
