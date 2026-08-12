import "server-only";

import {
  PADDLE_BILLING_ADAPTER_VERSION,
  type PaddleBillingAdapterConfiguration,
} from "@/server/paddle-billing-provider-adapter";

export const BILLING_WEBHOOK_CONFIGURATION_VERSION = "1.0.0";

const prohibitedPublicKeys = [
  "NEXT_PUBLIC_DATABASE_URL",
  "NEXT_PUBLIC_PADDLE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_PADDLE_PERSONAL_PRICE_REFERENCES",
  "NEXT_PUBLIC_PADDLE_ADVANCED_PRICE_REFERENCES",
] as const;

export interface BillingWebhookConfiguration {
  readonly version: typeof BILLING_WEBHOOK_CONFIGURATION_VERSION;
  readonly databaseUrl: string;
  readonly paddle: PaddleBillingAdapterConfiguration;
}

export class BillingWebhookConfigurationError extends Error {
  constructor() {
    super("Billing webhook configuration is unavailable.");
    this.name = "BillingWebhookConfigurationError";
  }
}

export function loadBillingWebhookConfiguration(
  environmentValue: unknown,
): BillingWebhookConfiguration {
  if (!record(environmentValue)) throw new BillingWebhookConfigurationError();
  if (
    prohibitedPublicKeys.some(
      (key) =>
        typeof environmentValue[key] === "string" &&
        environmentValue[key].length > 0,
    )
  )
    throw new BillingWebhookConfigurationError();

  const databaseUrl = databaseConnectionUrl(environmentValue.DATABASE_URL);
  const webhookSecret = webhookSecretValue(
    environmentValue.PADDLE_WEBHOOK_SECRET,
  );
  const personal = priceReferences(
    environmentValue.PADDLE_PERSONAL_PRICE_REFERENCES,
  );
  const advanced = priceReferences(
    environmentValue.PADDLE_ADVANCED_PRICE_REFERENCES,
  );
  if (
    new Set([...personal, ...advanced]).size !==
    personal.length + advanced.length
  )
    throw new BillingWebhookConfigurationError();

  return Object.freeze({
    version: BILLING_WEBHOOK_CONFIGURATION_VERSION,
    databaseUrl,
    paddle: Object.freeze({
      version: PADDLE_BILLING_ADAPTER_VERSION,
      webhookSecret,
      priceReferences: Object.freeze({ personal, advanced }),
    }),
  });
}

function databaseConnectionUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2_048 ||
    /[\0\r\n]/.test(value)
  )
    throw new BillingWebhookConfigurationError();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BillingWebhookConfigurationError();
  }
  if (
    (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") ||
    parsed.hostname.length < 1 ||
    parsed.pathname.length < 2 ||
    parsed.hash.length > 0
  )
    throw new BillingWebhookConfigurationError();
  return value;
}

function webhookSecretValue(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^pdl_ntfset_[A-Za-z0-9_]{32,200}$/.test(value)
  )
    throw new BillingWebhookConfigurationError();
  return value;
}

function priceReferences(value: unknown): readonly string[] {
  if (
    typeof value !== "string" ||
    value.length < 30 ||
    value.length > 16 * 31 - 1 ||
    /\s/.test(value)
  )
    throw new BillingWebhookConfigurationError();
  const references = value.split(",");
  if (
    references.length < 1 ||
    references.length > 16 ||
    references.some((reference) => !/^pri_[a-z0-9]{26}$/.test(reference)) ||
    new Set(references).size !== references.length
  )
    throw new BillingWebhookConfigurationError();
  return Object.freeze([...references]);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
