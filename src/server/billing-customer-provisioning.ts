import "server-only";

import type { AccountId } from "@/infrastructure/auth/account";
import type {
  BillingCustomerBindingResult,
  BillingCustomerIdentity,
} from "@/infrastructure/persistence/billing-customer-binding-repository";

export const BILLING_CUSTOMER_PROVISIONING_VERSION = "1.0.0";

export interface TrustedBillingContact {
  readonly email: string;
}

export interface BillingCustomerProviderRequest {
  readonly contact: TrustedBillingContact;
}

export type BillingCustomerProviderResult =
  | Readonly<{
      status: "ready";
      customerReference: string;
    }>
  | Readonly<{
      status: "rejected";
      reason: "invalid-contact";
    }>
  | Readonly<{
      status: "reconciliation-required";
    }>;

export interface BillingCustomerProvider {
  readonly providerKey: string;
  findOrProvisionCustomer(
    request: BillingCustomerProviderRequest,
  ): Promise<BillingCustomerProviderResult>;
}

export interface BillingCustomerBindingStore {
  findForProvider(
    ownerId: AccountId,
    provider: string,
  ): Promise<BillingCustomerIdentity | null>;
  bind(
    ownerId: AccountId,
    identity: BillingCustomerIdentity,
  ): Promise<BillingCustomerBindingResult>;
}

export type BillingCustomerProvisioningResult =
  | Readonly<{
      version: typeof BILLING_CUSTOMER_PROVISIONING_VERSION;
      disposition: "ready";
      code: "existing" | "bound";
    }>
  | Readonly<{
      version: typeof BILLING_CUSTOMER_PROVISIONING_VERSION;
      disposition: "reject";
      code: "invalid-request" | "invalid-contact";
    }>
  | Readonly<{
      version: typeof BILLING_CUSTOMER_PROVISIONING_VERSION;
      disposition: "retry";
      code: "provider-unavailable" | "binding-unavailable";
    }>
  | Readonly<{
      version: typeof BILLING_CUSTOMER_PROVISIONING_VERSION;
      disposition: "reconcile";
      code:
        | "provider-contract-invalid"
        | "provider-reconciliation-required"
        | "binding-conflict";
    }>;

export interface BillingCustomerProvisioningRequest {
  readonly ownerId: AccountId;
  readonly contact: TrustedBillingContact;
}

export class BillingCustomerProvisioner {
  private readonly inFlight = new Map<
    string,
    Promise<BillingCustomerProvisioningResult>
  >();

  constructor(
    private readonly provider: BillingCustomerProvider,
    private readonly bindings: BillingCustomerBindingStore,
  ) {}

  provision(requestValue: unknown): Promise<BillingCustomerProvisioningResult> {
    const request = validateRequest(requestValue);
    if (!request) return Promise.resolve(result("reject", "invalid-request"));
    const providerKey = validateProviderKey(this.provider.providerKey);
    if (!providerKey)
      return Promise.resolve(result("reconcile", "provider-contract-invalid"));

    const flightKey = `${request.ownerId}\0${providerKey}`;
    const pending = this.inFlight.get(flightKey);
    if (pending) return pending;

    const operation = this.provisionOnce(request, providerKey).finally(() => {
      if (this.inFlight.get(flightKey) === operation)
        this.inFlight.delete(flightKey);
    });
    this.inFlight.set(flightKey, operation);
    return operation;
  }

  private async provisionOnce(
    request: BillingCustomerProvisioningRequest,
    providerKey: string,
  ): Promise<BillingCustomerProvisioningResult> {
    let existing: BillingCustomerIdentity | null;
    try {
      existing = await this.bindings.findForProvider(
        request.ownerId,
        providerKey,
      );
    } catch {
      return result("retry", "binding-unavailable");
    }
    if (existing !== null) {
      if (!validIdentity(existing, providerKey))
        return result("reconcile", "binding-conflict");
      return result("ready", "existing");
    }

    let providerResult: BillingCustomerProviderResult;
    try {
      providerResult = await this.provider.findOrProvisionCustomer(
        Object.freeze({
          contact: request.contact,
        }),
      );
    } catch {
      return result("retry", "provider-unavailable");
    }
    if (!validProviderResult(providerResult))
      return result("reconcile", "provider-contract-invalid");
    if (providerResult.status === "reconciliation-required")
      return result("reconcile", "provider-reconciliation-required");
    if (providerResult.status === "rejected")
      return result("reject", "invalid-contact");

    const identity = Object.freeze({
      provider: providerKey,
      customerReference: providerResult.customerReference,
    });
    try {
      const bound = await this.bindings.bind(request.ownerId, identity);
      if (!validBindingResult(bound, identity))
        return result("reconcile", "binding-conflict");
      return result(
        "ready",
        bound.outcome === "created" ? "bound" : "existing",
      );
    } catch (error) {
      const conflict = isBindingConflict(error);
      return result(
        conflict ? "reconcile" : "retry",
        conflict ? "binding-conflict" : "binding-unavailable",
      );
    }
  }
}

function validateRequest(
  value: unknown,
): BillingCustomerProvisioningRequest | null {
  if (
    !record(value) ||
    !exactKeys(value, ["ownerId", "contact"]) ||
    !isUuid(value.ownerId) ||
    !record(value.contact) ||
    !exactKeys(value.contact, ["email"]) ||
    !validEmail(value.contact.email)
  )
    return null;
  return Object.freeze({
    ownerId: value.ownerId as AccountId,
    contact: Object.freeze({ email: value.contact.email.toLowerCase() }),
  });
}

function validProviderResult(
  value: unknown,
): value is BillingCustomerProviderResult {
  if (!record(value) || typeof value.status !== "string") return false;
  if (value.status === "rejected")
    return (
      exactKeys(value, ["status", "reason"]) &&
      value.reason === "invalid-contact"
    );
  if (value.status === "reconciliation-required")
    return exactKeys(value, ["status"]);
  return (
    value.status === "ready" &&
    exactKeys(value, ["status", "customerReference"]) &&
    safeCustomerReference(value.customerReference)
  );
}

function validBindingResult(
  value: unknown,
  identity: BillingCustomerIdentity,
): value is BillingCustomerBindingResult {
  return (
    record(value) &&
    exactKeys(value, ["outcome", "identity"]) &&
    (value.outcome === "created" || value.outcome === "existing") &&
    record(value.identity) &&
    exactKeys(value.identity, ["provider", "customerReference"]) &&
    value.identity.provider === identity.provider &&
    value.identity.customerReference === identity.customerReference
  );
}

function validIdentity(value: unknown, provider: string): boolean {
  return (
    record(value) &&
    exactKeys(value, ["provider", "customerReference"]) &&
    value.provider === provider &&
    safeCustomerReference(value.customerReference)
  );
}

function validateProviderKey(value: unknown): string | null {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value)
    ? value
    : null;
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

function safeCustomerReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function isBindingConflict(value: unknown): boolean {
  return (
    value instanceof Error &&
    value.name === "BillingCustomerBindingConflictError"
  );
}

function result<
  D extends BillingCustomerProvisioningResult["disposition"],
  C extends Extract<
    BillingCustomerProvisioningResult,
    { disposition: D }
  >["code"],
>(
  disposition: D,
  code: C,
): Extract<BillingCustomerProvisioningResult, { disposition: D }> {
  return Object.freeze({
    version: BILLING_CUSTOMER_PROVISIONING_VERSION,
    disposition,
    code,
  }) as unknown as Extract<
    BillingCustomerProvisioningResult,
    { disposition: D }
  >;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
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
