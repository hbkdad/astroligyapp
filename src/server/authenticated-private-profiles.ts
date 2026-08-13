import "server-only";

import type { AccountId } from "@/infrastructure/auth/account";
import {
  AuthenticationRequiredError,
  requireActiveSession,
  type ActiveSession,
  type SessionVerifier,
} from "@/infrastructure/auth/session";
import {
  PrivateProfileAuthorizationError,
  PrivateProfileConflictError,
  PrivateProfileLimitError,
} from "@/infrastructure/persistence/private-profile-repository";
import {
  PRIVATE_PROFILE_CONTRACT_VERSION,
  validatePrivateProfileCommand,
  type PrivateProfileView,
} from "@/server/private-profile-contracts";

export interface PrivateProfileAccountResolver {
  resolveActiveAccount(session: ActiveSession): Promise<AccountId>;
}

export interface PrivateProfileStore {
  list(ownerId: AccountId): Promise<
    Readonly<{
      profiles: readonly PrivateProfileView[];
      multipleProfilesAllowed: boolean;
    }>
  >;
  mutate(
    ownerId: AccountId,
    command: unknown,
  ): Promise<Readonly<{ outcome: "saved" | "deleted" }>>;
}

export interface AuthenticatedPrivateProfileDependencies {
  readonly sessionVerifier: SessionVerifier;
  readonly accountResolver: PrivateProfileAccountResolver;
  readonly profiles: PrivateProfileStore;
  readonly now?: () => Date;
}

export type PrivateProfileReadResult =
  | Readonly<{
      version: typeof PRIVATE_PROFILE_CONTRACT_VERSION;
      disposition: "ready";
      profiles: readonly PrivateProfileView[];
      multipleProfilesAllowed: boolean;
    }>
  | Readonly<{
      version: typeof PRIVATE_PROFILE_CONTRACT_VERSION;
      disposition: "authenticate" | "retry";
    }>;

export type PrivateProfileMutationResult = Readonly<{
  version: typeof PRIVATE_PROFILE_CONTRACT_VERSION;
  disposition:
    | "saved"
    | "deleted"
    | "authenticate"
    | "authorize"
    | "limit"
    | "conflict"
    | "retry";
}>;

export async function loadPrivateProfilesForRequest(
  request: Request,
  dependencies: AuthenticatedPrivateProfileDependencies,
): Promise<PrivateProfileReadResult> {
  const ownerId = await authorizedOwner(request, dependencies);
  if (ownerId === "authenticate") return readResult("authenticate");
  if (ownerId === "retry") return readResult("retry");
  try {
    const value = await dependencies.profiles.list(ownerId);
    return Object.freeze({
      version: PRIVATE_PROFILE_CONTRACT_VERSION,
      disposition: "ready" as const,
      profiles: Object.freeze([...value.profiles]),
      multipleProfilesAllowed: value.multipleProfilesAllowed,
    });
  } catch {
    return readResult("retry");
  }
}

export async function mutatePrivateProfileForRequest(
  request: Request,
  commandValue: unknown,
  dependencies: AuthenticatedPrivateProfileDependencies,
): Promise<PrivateProfileMutationResult> {
  const ownerId = await authorizedOwner(request, dependencies);
  if (ownerId === "authenticate") return mutationResult("authenticate");
  if (ownerId === "retry") return mutationResult("retry");
  const command = validatePrivateProfileCommand(
    commandValue,
    dependencies.now?.() ?? new Date(),
  );
  if (!command) return mutationResult("authorize");
  try {
    const result = await dependencies.profiles.mutate(ownerId, command);
    return mutationResult(result.outcome);
  } catch (error) {
    if (error instanceof PrivateProfileLimitError)
      return mutationResult("limit");
    if (error instanceof PrivateProfileConflictError)
      return mutationResult("conflict");
    if (error instanceof PrivateProfileAuthorizationError)
      return mutationResult("authorize");
    return mutationResult("retry");
  }
}

async function authorizedOwner(
  request: Request,
  dependencies: AuthenticatedPrivateProfileDependencies,
): Promise<AccountId | "authenticate" | "retry"> {
  let session: ActiveSession;
  try {
    session = await requireActiveSession(
      dependencies.sessionVerifier,
      request,
      dependencies.now,
    );
  } catch (error) {
    return error instanceof AuthenticationRequiredError
      ? "authenticate"
      : "retry";
  }
  try {
    const ownerId =
      await dependencies.accountResolver.resolveActiveAccount(session);
    return uuid(ownerId) ? ownerId : "retry";
  } catch {
    return "retry";
  }
}

function readResult(
  disposition: "authenticate" | "retry",
): PrivateProfileReadResult {
  return Object.freeze({
    version: PRIVATE_PROFILE_CONTRACT_VERSION,
    disposition,
  });
}

function mutationResult(
  disposition: PrivateProfileMutationResult["disposition"],
): PrivateProfileMutationResult {
  return Object.freeze({
    version: PRIVATE_PROFILE_CONTRACT_VERSION,
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
