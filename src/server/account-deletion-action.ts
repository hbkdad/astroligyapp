import "server-only";

import type { AccountDeletionState } from "@/presentation/account-deletion-state";
import type { AuthenticatedAccountDeletionResult } from "@/server/authenticated-account-deletion";

const MAX_COOKIE_BYTES = 8_192;
const EXPECTED_FIELDS = ["version", "confirmation", "currentPassword"] as const;

export interface AccountDeletionService {
  readonly canonicalOrigin: string;
  deleteAccount(request: Request): Promise<AuthenticatedAccountDeletionResult>;
}

export async function deleteAccountFromForm(
  requestHeaders: Pick<Headers, "get">,
  formData: FormData,
  getService: () => AccountDeletionService,
): Promise<AccountDeletionState> {
  let values: ReturnType<typeof deletionValues>;
  let cookie: string | null;
  try {
    values = deletionValues(formData);
    cookie = boundedCookie(requestHeaders);
  } catch {
    return state("authorize");
  }
  try {
    const service = getService();
    const origin = canonicalOrigin(service.canonicalOrigin);
    const body = JSON.stringify(values);
    const headers = new Headers({
      "content-length": String(Buffer.byteLength(body, "utf8")),
      "content-type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
    });
    if (cookie) headers.set("cookie", cookie);
    return project(
      await service.deleteAccount(
        new Request(`${origin}/internal/account-deletion`, {
          method: "POST",
          headers,
          body,
        }),
      ),
    );
  } catch {
    return state("retry");
  }
}

function deletionValues(formData: FormData) {
  if (!(formData instanceof FormData)) invalid();
  const entries = [...formData.entries()].filter(
    ([key]) => !key.startsWith("$ACTION_"),
  );
  const version = entries[0]?.[1];
  const confirmation = entries[1]?.[1];
  const currentPassword = entries[2]?.[1];
  if (
    entries.length !== EXPECTED_FIELDS.length ||
    entries.some(([key], index) => key !== EXPECTED_FIELDS[index]) ||
    typeof version !== "string" ||
    typeof confirmation !== "string" ||
    typeof currentPassword !== "string" ||
    version !== "1.0.0" ||
    confirmation !== "DELETE MY ACCOUNT" ||
    currentPassword.length < 8 ||
    currentPassword.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(currentPassword)
  )
    invalid();
  return Object.freeze({ version, confirmation, currentPassword });
}

function boundedCookie(requestHeaders: Pick<Headers, "get">): string | null {
  if (!requestHeaders || typeof requestHeaders.get !== "function") invalid();
  const cookie = requestHeaders.get("cookie");
  if (cookie === null) return null;
  if (
    typeof cookie !== "string" ||
    Buffer.byteLength(cookie, "utf8") > MAX_COOKIE_BYTES ||
    /[\0\r\n]/.test(cookie)
  )
    invalid();
  return cookie;
}

function canonicalOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) invalid();
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.origin !== value ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    invalid();
  return value;
}

function project(value: unknown): AccountDeletionState {
  if (
    !record(value) ||
    Object.keys(value).length !== 3 ||
    value.version !== "1.0.0"
  )
    return state("retry");
  if (value.disposition === "deleted" && value.code === "account-deleted")
    return state("deleted");
  if (
    value.disposition === "authenticate" &&
    value.code === "authentication-required"
  )
    return state("authenticate");
  if (
    value.disposition === "reject" &&
    value.code === "deletion-not-authorized"
  )
    return state("authorize");
  if (
    value.disposition === "reconcile" &&
    value.code === "external-account-reconciliation-required"
  )
    return state("reconcile");
  if (
    value.disposition === "retry" &&
    [
      "authentication-unavailable",
      "account-unavailable",
      "reauthentication-unavailable",
      "deletion-unavailable",
    ].includes(value.code as string)
  )
    return state("retry");
  return state("retry");
}

function state(status: AccountDeletionState["status"]): AccountDeletionState {
  return Object.freeze({ status });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new TypeError("Invalid account deletion action input");
}
