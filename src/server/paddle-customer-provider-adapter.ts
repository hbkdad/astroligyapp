import "server-only";

import type {
  CreateCustomerRequestBody,
  ListCustomerQueryParameters,
} from "@paddle/paddle-node-sdk";

import type {
  BillingCustomerProvider,
  BillingCustomerProviderRequest,
  BillingCustomerProviderResult,
} from "@/server/billing-customer-provisioning";

export interface PaddleCustomerClient {
  readonly customers: {
    list(query?: ListCustomerQueryParameters): AsyncIterable<unknown>;
    create(request: CreateCustomerRequestBody): Promise<unknown>;
  };
}

export function createPaddleCustomerProviderAdapter(
  client: PaddleCustomerClient,
): BillingCustomerProvider {
  return Object.freeze({
    providerKey: "paddle",
    async findOrProvisionCustomer(
      requestValue: BillingCustomerProviderRequest,
    ): Promise<BillingCustomerProviderResult> {
      const request = validateRequest(requestValue);
      if (!request)
        return Object.freeze({
          status: "rejected",
          reason: "invalid-contact",
        });

      const initial = await findActiveCustomer(client, request.contact.email);
      if (initial.status === "ready") return ready(initial.customerReference);
      if (initial.status === "ambiguous") return reconciliationRequired();

      try {
        const created = await client.customers.create({
          email: request.contact.email,
        });
        const customerReference = exactActiveCustomer(
          created,
          request.contact.email,
        );
        if (customerReference) return ready(customerReference);
      } catch (error) {
        if (invalidContactError(error))
          return Object.freeze({
            status: "rejected",
            reason: "invalid-contact",
          });
      }

      try {
        const reconciled = await findActiveCustomer(
          client,
          request.contact.email,
        );
        return reconciled.status === "ready"
          ? ready(reconciled.customerReference)
          : reconciliationRequired();
      } catch {
        return reconciliationRequired();
      }
    },
  });
}

type CustomerLookup =
  | Readonly<{ status: "none" }>
  | Readonly<{ status: "ambiguous" }>
  | Readonly<{ status: "ready"; customerReference: string }>;

async function findActiveCustomer(
  client: PaddleCustomerClient,
  email: string,
): Promise<CustomerLookup> {
  const collection = client.customers.list({
    email: [email],
    status: ["active"],
    perPage: 2,
  });
  if (!collection || typeof collection[Symbol.asyncIterator] !== "function")
    throw new TypeError("Paddle customer collection is invalid");

  const references: string[] = [];
  for await (const candidate of collection) {
    const reference = exactActiveCustomer(candidate, email);
    if (!reference) return Object.freeze({ status: "ambiguous" });
    references.push(reference);
    if (references.length === 2) return Object.freeze({ status: "ambiguous" });
  }
  if (references.length === 0) return Object.freeze({ status: "none" });
  return Object.freeze({
    status: "ready",
    customerReference: references[0]!,
  });
}

function exactActiveCustomer(value: unknown, email: string): string | null {
  if (
    !record(value) ||
    value.status !== "active" ||
    typeof value.email !== "string" ||
    value.email.toLowerCase() !== email ||
    typeof value.id !== "string" ||
    !/^ctm_[a-z\d]{26}$/.test(value.id)
  )
    return null;
  return value.id;
}

function validateRequest(
  value: unknown,
): BillingCustomerProviderRequest | null {
  if (
    !record(value) ||
    !exactKeys(value, ["contact"]) ||
    !record(value.contact) ||
    !exactKeys(value.contact, ["email"]) ||
    !validEmail(value.contact.email) ||
    value.contact.email !== value.contact.email.toLowerCase()
  )
    return null;
  return Object.freeze({
    contact: Object.freeze({ email: value.contact.email }),
  });
}

function invalidContactError(value: unknown): boolean {
  if (!record(value) || typeof value.code !== "string") return false;
  return (
    value.code === "customer_email_invalid" ||
    value.code === "customer_email_domain_not_allowed"
  );
}

function ready(customerReference: string): BillingCustomerProviderResult {
  return Object.freeze({ status: "ready", customerReference });
}

function reconciliationRequired(): BillingCustomerProviderResult {
  return Object.freeze({ status: "reconciliation-required" });
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
