import "server-only";

import type { AccountId } from "@/infrastructure/auth/account";
import {
  AuthenticationRequiredError,
  requireActiveSession,
  type ActiveSession,
  type SessionVerifier,
} from "@/infrastructure/auth/session";
import {
  NotificationPreferenceAuthorizationError,
  NotificationPreferenceConflictError,
  NotificationPreferenceLockedError,
  NotificationPreferenceUnavailableError,
  type NotificationMaterializationResult,
  type NotificationPreferenceView,
} from "@/infrastructure/persistence/notification-preference-repository";
import { ProtectedNatalUnavailableError } from "@/infrastructure/persistence/protected-natal-chart-repository";
import {
  NOTIFICATION_PREFERENCE_CONTRACT_VERSION,
  validateNotificationPreferenceCommand,
  validateNotificationPreferenceSelection,
  type NotificationPreferenceCommand,
  type NotificationPreferenceSelection,
} from "@/server/notification-preference-contracts";

export interface NotificationPreferenceDependencies {
  readonly sessionVerifier: SessionVerifier;
  readonly accountResolver: {
    resolveActiveAccount(session: ActiveSession): Promise<AccountId>;
  };
  readonly preferences: {
    load(
      ownerId: AccountId,
      value: unknown,
    ): Promise<NotificationPreferenceView>;
    replace(
      ownerId: AccountId,
      value: unknown,
    ): Promise<NotificationPreferenceView>;
    materialize(
      ownerId: AccountId,
      value: unknown,
    ): Promise<NotificationMaterializationResult>;
  };
  readonly now?: () => Date;
}

export type NotificationPreferenceResponse =
  | Readonly<{
      version: typeof NOTIFICATION_PREFERENCE_CONTRACT_VERSION;
      disposition: "ready";
      view: NotificationPreferenceView;
      materialization: null | Readonly<{
        status: "prepared" | "calculation-unavailable";
        inserted: number;
        existing: number;
        invalidated: number;
        skippedPast: number;
        deliveryProvider: "unavailable";
      }>;
    }>
  | Readonly<{
      version: typeof NOTIFICATION_PREFERENCE_CONTRACT_VERSION;
      disposition:
        | "authenticate"
        | "authorize"
        | "locked"
        | "conflict"
        | "unavailable"
        | "retry";
    }>;

export async function loadNotificationPreferencesForRequest(
  request: Request,
  selectionValue: unknown,
  dependencies: NotificationPreferenceDependencies,
): Promise<NotificationPreferenceResponse> {
  const context = await authorize(request, dependencies);
  if (!context.ok) return context.response;
  const selection = validateNotificationPreferenceSelection(selectionValue);
  if (!selection) return response("authorize");
  try {
    const view = await dependencies.preferences.load(
      context.ownerId,
      selection,
    );
    return ready(view, null);
  } catch (error) {
    return mapError(error);
  }
}

export async function replaceNotificationPreferencesForRequest(
  request: Request,
  commandValue: unknown,
  dependencies: NotificationPreferenceDependencies,
): Promise<NotificationPreferenceResponse> {
  const context = await authorize(request, dependencies);
  if (!context.ok) return context.response;
  const command = validateNotificationPreferenceCommand(commandValue);
  if (!command) return response("authorize");
  let view: NotificationPreferenceView;
  try {
    view = await dependencies.preferences.replace(context.ownerId, command);
  } catch (error) {
    return mapError(error);
  }
  const selection = selectionFrom(command);
  try {
    const result = await dependencies.preferences.materialize(
      context.ownerId,
      selection,
    );
    view = await dependencies.preferences.load(context.ownerId, selection);
    return ready(view, {
      status: "prepared",
      inserted: result.inserted,
      existing: result.existing,
      invalidated: result.invalidated,
      skippedPast: result.skippedPast,
      deliveryProvider: "unavailable",
    });
  } catch {
    // The preference transaction already committed. Never misreport that save
    // as failed because a later calculation/reload could not be completed.
    return ready(view, {
      status: "calculation-unavailable",
      inserted: 0,
      existing: 0,
      invalidated: 0,
      skippedPast: 0,
      deliveryProvider: "unavailable",
    });
  }
}

async function authorize(
  request: Request,
  dependencies: NotificationPreferenceDependencies,
): Promise<
  | Readonly<{ ok: true; ownerId: AccountId }>
  | Readonly<{ ok: false; response: NotificationPreferenceResponse }>
> {
  let session: ActiveSession;
  try {
    session = await requireActiveSession(
      dependencies.sessionVerifier,
      request,
      dependencies.now,
    );
  } catch (error) {
    return {
      ok: false,
      response: response(
        error instanceof AuthenticationRequiredError ? "authenticate" : "retry",
      ),
    };
  }
  try {
    const ownerId =
      await dependencies.accountResolver.resolveActiveAccount(session);
    if (!uuid(ownerId)) return { ok: false, response: response("retry") };
    return { ok: true, ownerId };
  } catch {
    return { ok: false, response: response("retry") };
  }
}

function selectionFrom(
  command: NotificationPreferenceCommand,
): NotificationPreferenceSelection {
  return {
    version: NOTIFICATION_PREFERENCE_CONTRACT_VERSION,
    profileId: command.profileId,
    birthProfileId: command.birthProfileId,
    profileRevision: command.profileRevision,
  };
}

function ready(
  view: NotificationPreferenceView,
  materialization: Extract<
    NotificationPreferenceResponse,
    { disposition: "ready" }
  >["materialization"],
): NotificationPreferenceResponse {
  return Object.freeze({
    version: NOTIFICATION_PREFERENCE_CONTRACT_VERSION,
    disposition: "ready",
    view,
    materialization,
  });
}

function mapError(error: unknown): NotificationPreferenceResponse {
  if (error instanceof NotificationPreferenceAuthorizationError)
    return response("authorize");
  if (error instanceof NotificationPreferenceConflictError)
    return response("conflict");
  if (error instanceof NotificationPreferenceLockedError)
    return response("locked");
  if (
    error instanceof NotificationPreferenceUnavailableError ||
    error instanceof ProtectedNatalUnavailableError
  )
    return response("unavailable");
  return response("retry");
}

function response(
  disposition: Exclude<
    NotificationPreferenceResponse,
    { disposition: "ready" }
  >["disposition"],
): NotificationPreferenceResponse {
  return Object.freeze({
    version: NOTIFICATION_PREFERENCE_CONTRACT_VERSION,
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
