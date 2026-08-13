import "server-only";

import type { AccountId } from "@/infrastructure/auth/account";
import {
  AuthenticationRequiredError,
  requireActiveSession,
  type ActiveSession,
  type SessionVerifier,
} from "@/infrastructure/auth/session";
import {
  PersonalTimelineAuthorizationError,
  PersonalTimelineConflictError,
  PersonalTimelineLockedError,
  PersonalTimelineUnavailableError,
  type PersonalTimelineRepositoryResult,
} from "@/infrastructure/persistence/personal-timeline-repository";
import { ProtectedNatalUnavailableError } from "@/infrastructure/persistence/protected-natal-chart-repository";
import type { TimelineReadModel } from "@/presentation/timeline-read-model";
import {
  PERSONAL_TIMELINE_CONTRACT_VERSION,
  validatePersonalTimelineCommand,
} from "@/server/personal-timeline-contracts";

export interface PersonalTimelineDependencies {
  readonly sessionVerifier: SessionVerifier;
  readonly accountResolver: {
    resolveActiveAccount(session: ActiveSession): Promise<AccountId>;
  };
  readonly timelines: {
    load(
      ownerId: AccountId,
      command: unknown,
    ): Promise<PersonalTimelineRepositoryResult>;
  };
  readonly now?: () => Date;
}

export type PersonalTimelineResponse =
  | Readonly<{
      version: typeof PERSONAL_TIMELINE_CONTRACT_VERSION;
      disposition: "ready";
      model: TimelineReadModel;
      scope: "forecast" | "full-transit-calendar";
      truncated: boolean;
    }>
  | Readonly<{
      version: typeof PERSONAL_TIMELINE_CONTRACT_VERSION;
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

export async function loadPersonalTimelineForRequest(
  request: Request,
  commandValue: unknown,
  dependencies: PersonalTimelineDependencies,
): Promise<PersonalTimelineResponse> {
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
  const command = validatePersonalTimelineCommand(commandValue);
  if (!command) return response("authorize");
  try {
    const ownerId =
      await dependencies.accountResolver.resolveActiveAccount(session);
    if (!uuid(ownerId)) return response("retry");
    const result = await dependencies.timelines.load(ownerId, command);
    if (result.outcome !== "ready") return response(result.outcome);
    return Object.freeze({
      version: PERSONAL_TIMELINE_CONTRACT_VERSION,
      disposition: "ready",
      model: result.model,
      scope: result.scope,
      truncated: result.truncated,
    });
  } catch (error) {
    if (error instanceof PersonalTimelineAuthorizationError)
      return response("authorize");
    if (error instanceof PersonalTimelineConflictError)
      return response("conflict");
    if (error instanceof PersonalTimelineLockedError) return response("locked");
    if (
      error instanceof PersonalTimelineUnavailableError ||
      error instanceof ProtectedNatalUnavailableError
    )
      return response("unavailable");
    return response("retry");
  }
}

function response(
  disposition: Exclude<
    PersonalTimelineResponse,
    { disposition: "ready" }
  >["disposition"],
): PersonalTimelineResponse {
  return Object.freeze({
    version: PERSONAL_TIMELINE_CONTRACT_VERSION,
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
