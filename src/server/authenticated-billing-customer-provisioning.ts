import "server-only";

import type { AccountId } from "@/infrastructure/auth/account";
import {
  AuthenticationRequiredError,
  requireActiveSession,
  type ActiveSession,
  type SessionVerifier,
} from "@/infrastructure/auth/session";
import type {
  BillingCustomerProvisioningResult,
  TrustedBillingContact,
} from "@/server/billing-customer-provisioning";

export const AUTHENTICATED_BILLING_PROVISIONING_VERSION = "1.0.0";

export interface ActiveBillingAccountResolver {
  resolveActiveAccount(session: ActiveSession): Promise<AccountId>;
}

export interface TrustedBillingContactResolver {
  resolveTrustedContact(
    session: ActiveSession,
    ownerId: AccountId,
  ): Promise<TrustedBillingContact | null>;
}

export interface BillingCustomerProvisioningPort {
  provision(value: unknown): Promise<BillingCustomerProvisioningResult>;
}

export type AuthenticatedBillingProvisioningResult =
  | Readonly<{
      version: typeof AUTHENTICATED_BILLING_PROVISIONING_VERSION;
      disposition: "ready";
      code: "customer-ready";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_BILLING_PROVISIONING_VERSION;
      disposition: "authenticate";
      code: "authentication-required";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_BILLING_PROVISIONING_VERSION;
      disposition: "reject";
      code: "billing-contact-invalid" | "billing-contact-unavailable";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_BILLING_PROVISIONING_VERSION;
      disposition: "retry";
      code:
        | "authentication-unavailable"
        | "account-unavailable"
        | "contact-source-unavailable"
        | "provisioning-unavailable";
    }>
  | Readonly<{
      version: typeof AUTHENTICATED_BILLING_PROVISIONING_VERSION;
      disposition: "reconcile";
      code: "customer-reconciliation-required";
    }>;

export interface AuthenticatedBillingProvisioningDependencies {
  readonly sessionVerifier: SessionVerifier;
  readonly accountResolver: ActiveBillingAccountResolver;
  readonly contactResolver: TrustedBillingContactResolver;
  readonly customerProvisioner: BillingCustomerProvisioningPort;
  readonly now?: () => Date;
}

export async function provisionBillingCustomerForRequest(
  request: Request,
  dependencies: AuthenticatedBillingProvisioningDependencies,
): Promise<AuthenticatedBillingProvisioningResult> {
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

  let ownerId: AccountId;
  try {
    ownerId = await dependencies.accountResolver.resolveActiveAccount(session);
  } catch {
    return result("retry", "account-unavailable");
  }
  if (!isUuid(ownerId)) return result("retry", "account-unavailable");

  let contact: TrustedBillingContact | null;
  try {
    contact = await dependencies.contactResolver.resolveTrustedContact(
      session,
      ownerId,
    );
  } catch {
    return result("retry", "contact-source-unavailable");
  }
  if (contact === null) return result("reject", "billing-contact-unavailable");
  const trustedContact = validateContact(contact);
  if (!trustedContact) return result("reject", "billing-contact-invalid");

  let provisioned: BillingCustomerProvisioningResult;
  try {
    provisioned = await dependencies.customerProvisioner.provision({
      ownerId,
      contact: trustedContact,
    });
  } catch {
    return result("retry", "provisioning-unavailable");
  }
  if (!validProvisioningResult(provisioned))
    return result("reconcile", "customer-reconciliation-required");
  if (provisioned.disposition === "ready")
    return result("ready", "customer-ready");
  if (provisioned.disposition === "reject")
    return result("reject", "billing-contact-invalid");
  if (provisioned.disposition === "retry")
    return result("retry", "provisioning-unavailable");
  return result("reconcile", "customer-reconciliation-required");
}

function validateContact(value: unknown): TrustedBillingContact | null {
  if (
    !record(value) ||
    !exactKeys(value, ["email"]) ||
    !validEmail(value.email)
  )
    return null;
  return Object.freeze({ email: value.email.toLowerCase() });
}

function validProvisioningResult(
  value: unknown,
): value is BillingCustomerProvisioningResult {
  if (
    !record(value) ||
    !exactKeys(value, ["version", "disposition", "code"]) ||
    value.version !== "1.0.0"
  )
    return false;
  const pairs: Readonly<Record<string, readonly string[]>> = Object.freeze({
    ready: Object.freeze(["existing", "bound"]),
    reject: Object.freeze(["invalid-request", "invalid-contact"]),
    retry: Object.freeze(["provider-unavailable", "binding-unavailable"]),
    reconcile: Object.freeze([
      "provider-contract-invalid",
      "provider-reconciliation-required",
      "binding-conflict",
    ]),
  });
  return (
    typeof value.disposition === "string" &&
    typeof value.code === "string" &&
    (pairs[value.disposition]?.includes(value.code) ?? false)
  );
}

function validEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(
      value,
    )
  );
}

function isUuid(value: unknown): value is AccountId {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function result<
  D extends AuthenticatedBillingProvisioningResult["disposition"],
  C extends Extract<
    AuthenticatedBillingProvisioningResult,
    { disposition: D }
  >["code"],
>(
  disposition: D,
  code: C,
): Extract<AuthenticatedBillingProvisioningResult, { disposition: D }> {
  return Object.freeze({
    version: AUTHENTICATED_BILLING_PROVISIONING_VERSION,
    disposition,
    code,
  }) as unknown as Extract<
    AuthenticatedBillingProvisioningResult,
    { disposition: D }
  >;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}
