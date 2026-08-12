import "server-only";

import type {
  AccountId,
  LocalAccountDeletionOutcome,
} from "@/infrastructure/auth/account";
import {
  AuthenticationRequiredError,
  requireActiveSession,
  type ActiveSession,
  type SessionVerifier,
} from "@/infrastructure/auth/session";

export const AUTHENTICATED_ACCOUNT_DELETION_VERSION = "1.0.0";
const CONFIRMATION = "DELETE MY ACCOUNT";
const MAX_BODY_BYTES = 512;

export interface DeletionActiveAccountResolver {
  resolveActiveAccount(session: ActiveSession): Promise<AccountId>;
}

export interface CurrentPasswordReauthenticator {
  verify(request: Request, currentPassword: string): Promise<boolean>;
}

export interface LocalAccountEraser {
  erase(
    session: ActiveSession,
    ownerId: AccountId,
  ): Promise<LocalAccountDeletionOutcome>;
}

export interface AuthenticatedAccountDeletionDependencies {
  readonly canonicalOrigin: string;
  readonly sessionVerifier: SessionVerifier;
  readonly accountResolver: DeletionActiveAccountResolver;
  readonly passwordReauthenticator: CurrentPasswordReauthenticator;
  readonly eraser: LocalAccountEraser;
  readonly now?: () => Date;
}

export type AuthenticatedAccountDeletionResult =
  | Readonly<{
      version: typeof AUTHENTICATED_ACCOUNT_DELETION_VERSION;
      disposition: "deleted";
      code: "account-deleted";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_ACCOUNT_DELETION_VERSION;
      disposition: "authenticate";
      code: "authentication-required";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_ACCOUNT_DELETION_VERSION;
      disposition: "reject";
      code: "deletion-not-authorized";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_ACCOUNT_DELETION_VERSION;
      disposition: "retry";
      code:
        | "authentication-unavailable"
        | "account-unavailable"
        | "reauthentication-unavailable"
        | "deletion-unavailable";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_ACCOUNT_DELETION_VERSION;
      disposition: "reconcile";
      code: "external-account-reconciliation-required";
    }>;

export async function deleteAccountForRequest(
  request: Request,
  dependencies: AuthenticatedAccountDeletionDependencies,
): Promise<AuthenticatedAccountDeletionResult> {
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

  let intent: Readonly<{ currentPassword: string }>;
  try {
    intent = await readDeletionIntent(request, dependencies.canonicalOrigin);
  } catch {
    return result("reject", "deletion-not-authorized");
  }

  let ownerId: AccountId;
  try {
    ownerId = await dependencies.accountResolver.resolveActiveAccount(session);
  } catch {
    return result("retry", "account-unavailable");
  }
  if (!uuid(ownerId)) return result("retry", "account-unavailable");

  try {
    if (
      !(await dependencies.passwordReauthenticator.verify(
        request,
        intent.currentPassword,
      ))
    )
      return result("reject", "deletion-not-authorized");
  } catch {
    return result("retry", "reauthentication-unavailable");
  }

  let erased: LocalAccountDeletionOutcome;
  try {
    erased = await dependencies.eraser.erase(session, ownerId);
  } catch {
    return result("retry", "deletion-unavailable");
  }
  if (erased === "deleted") return result("deleted", "account-deleted");
  if (erased === "reconciliation-required")
    return result("reconcile", "external-account-reconciliation-required");
  return result("retry", "deletion-unavailable");
}

async function readDeletionIntent(
  request: Request,
  canonicalOriginValue: unknown,
): Promise<Readonly<{ currentPassword: string }>> {
  const canonicalOrigin = canonicalOriginValue as string;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    invalid();
  }
  if (
    canonicalOrigin !== url.origin ||
    url.protocol !== "https:" ||
    url.pathname !== "/internal/account-deletion" ||
    url.search ||
    url.hash ||
    request.method !== "POST" ||
    request.headers.get("origin") !== canonicalOrigin ||
    request.headers.get("sec-fetch-site") !== "same-origin" ||
    request.headers.get("content-type") !== "application/json"
  )
    invalid();
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    !Number.isSafeInteger(declaredLength) ||
    declaredLength < 1 ||
    declaredLength > MAX_BODY_BYTES
  )
    invalid();
  const raw = await readBody(request, MAX_BODY_BYTES);
  if (Buffer.byteLength(raw, "utf8") !== declaredLength) invalid();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    invalid();
  }
  if (
    !record(value) ||
    Object.keys(value).length !== 3 ||
    Object.keys(value)[0] !== "version" ||
    Object.keys(value)[1] !== "confirmation" ||
    Object.keys(value)[2] !== "currentPassword" ||
    value.version !== AUTHENTICATED_ACCOUNT_DELETION_VERSION ||
    value.confirmation !== CONFIRMATION ||
    typeof value.currentPassword !== "string" ||
    value.currentPassword.length < 8 ||
    value.currentPassword.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value.currentPassword) ||
    raw !== JSON.stringify(value)
  )
    invalid();
  return Object.freeze({ currentPassword: value.currentPassword });
}

async function readBody(request: Request, maximum: number): Promise<string> {
  if (!request.body) invalid();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      invalid();
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    invalid();
  }
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
  D extends AuthenticatedAccountDeletionResult["disposition"],
  C extends Extract<
    AuthenticatedAccountDeletionResult,
    { disposition: D }
  >["code"],
>(
  disposition: D,
  code: C,
): Extract<AuthenticatedAccountDeletionResult, { disposition: D }> {
  return Object.freeze({
    version: AUTHENTICATED_ACCOUNT_DELETION_VERSION,
    disposition,
    code,
  }) as unknown as Extract<
    AuthenticatedAccountDeletionResult,
    { disposition: D }
  >;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new TypeError("Invalid account deletion request");
}
