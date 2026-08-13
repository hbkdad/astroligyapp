import "server-only";

import type { AccountActivationState } from "@/presentation/account-activation-state";
import type { AuthenticatedAccountBootstrapResult } from "@/server/authenticated-account-bootstrap";

const MAXIMUM_COOKIE_HEADER_LENGTH = 8 * 1024;

export interface AccountActivationService {
  readonly canonicalOrigin: string;
  activateAccount(
    request: Request,
  ): Promise<AuthenticatedAccountBootstrapResult>;
}

export interface RequestHeaderReader {
  get(name: string): string | null;
}

export async function activateAccountFromHeaders(
  requestHeaders: RequestHeaderReader,
  containsClientFields: boolean,
  getService: () => AccountActivationService,
): Promise<AccountActivationState> {
  if (
    containsClientFields ||
    !requestHeaders ||
    typeof requestHeaders.get !== "function"
  )
    return state("retry");

  const cookie = requestHeaders.get("cookie");
  if (
    cookie !== null &&
    (cookie.length > MAXIMUM_COOKIE_HEADER_LENGTH || /[\0\r\n]/u.test(cookie))
  )
    return state("retry");

  try {
    const service = getService();
    if (!service || typeof service.activateAccount !== "function")
      return state("retry");
    const request = new Request(
      `${canonicalOrigin(service.canonicalOrigin)}/internal/account-bootstrap`,
      {
        method: "POST",
        ...(cookie === null ? {} : { headers: { cookie } }),
      },
    );
    return project(await service.activateAccount(request));
  } catch {
    return state("retry");
  }
}

function project(value: unknown): AccountActivationState {
  if (!exactBootstrapResult(value)) return state("retry");
  return state(value.disposition);
}

function exactBootstrapResult(
  value: unknown,
): value is AuthenticatedAccountBootstrapResult {
  if (!record(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== 3 ||
    !keys.includes("version") ||
    !keys.includes("disposition") ||
    !keys.includes("code") ||
    value.version !== "1.0.0"
  )
    return false;
  if (value.disposition === "ready") return value.code === "account-ready";
  if (value.disposition === "authenticate")
    return value.code === "authentication-required";
  if (value.disposition === "reconcile")
    return value.code === "account-identity-mismatch";
  return (
    value.disposition === "retry" &&
    (value.code === "authentication-unavailable" ||
      value.code === "bootstrap-unavailable" ||
      value.code === "account-unavailable" ||
      value.code === "identity-boundary-unavailable")
  );
}

function canonicalOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) throw new TypeError();
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new TypeError();
  return url.origin;
}

function state(
  status: Exclude<AccountActivationState["status"], "idle">,
): AccountActivationState {
  return Object.freeze({ status });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
