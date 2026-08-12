import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BILLING_WEBHOOK_CONFIGURATION_VERSION,
  BillingWebhookConfigurationError,
  loadBillingWebhookConfiguration,
} from "@/server/billing-webhook-configuration";

const SECRET = `pdl_ntfset_${"s".repeat(40)}`;
const PERSONAL = `pri_${"p".repeat(26)}`;
const PERSONAL_YEARLY = `pri_${"y".repeat(26)}`;
const ADVANCED = `pri_${"a".repeat(26)}`;

function environment(overrides: Record<string, unknown> = {}) {
  return {
    DATABASE_URL: "postgresql://billing:local@127.0.0.1:5432/cosmic",
    PADDLE_WEBHOOK_SECRET: SECRET,
    PADDLE_PERSONAL_PRICE_REFERENCES: `${PERSONAL},${PERSONAL_YEARLY}`,
    PADDLE_ADVANCED_PRICE_REFERENCES: ADVANCED,
    UNRELATED_PROCESS_VALUE: "allowed",
    ...overrides,
  };
}

describe("billing webhook server configuration", () => {
  it("loads one deeply immutable canonical server configuration", () => {
    const result = loadBillingWebhookConfiguration(environment());
    expect(result).toEqual({
      version: BILLING_WEBHOOK_CONFIGURATION_VERSION,
      databaseUrl: "postgresql://billing:local@127.0.0.1:5432/cosmic",
      paddle: {
        version: "1.0.0",
        webhookSecret: SECRET,
        priceReferences: {
          personal: [PERSONAL, PERSONAL_YEARLY],
          advanced: [ADVANCED],
        },
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.paddle)).toBe(true);
    expect(Object.isFrozen(result.paddle.priceReferences)).toBe(true);
    expect(Object.isFrozen(result.paddle.priceReferences.personal)).toBe(true);
    expect(Object.isFrozen(result.paddle.priceReferences.advanced)).toBe(true);
  });

  it.each([
    null,
    [],
    environment({ DATABASE_URL: undefined }),
    environment({ DATABASE_URL: "https://database.example.test/cosmic" }),
    environment({ DATABASE_URL: "postgresql://" }),
    environment({ DATABASE_URL: "postgresql://localhost" }),
    environment({ DATABASE_URL: "postgresql://localhost/cosmic#fragment" }),
    environment({ DATABASE_URL: "postgresql://localhost/cosmic\nleak" }),
    environment({ PADDLE_WEBHOOK_SECRET: "secret-value" }),
    environment({ PADDLE_PERSONAL_PRICE_REFERENCES: "" }),
    environment({ PADDLE_PERSONAL_PRICE_REFERENCES: "pri_invalid" }),
    environment({
      PADDLE_PERSONAL_PRICE_REFERENCES: `${PERSONAL}, ${PERSONAL_YEARLY}`,
    }),
    environment({
      PADDLE_PERSONAL_PRICE_REFERENCES: `${PERSONAL},${PERSONAL}`,
    }),
    environment({ PADDLE_ADVANCED_PRICE_REFERENCES: PERSONAL }),
    environment({ NEXT_PUBLIC_DATABASE_URL: "postgresql://public/leak" }),
    environment({ NEXT_PUBLIC_PADDLE_WEBHOOK_SECRET: SECRET }),
    environment({ NEXT_PUBLIC_PADDLE_PERSONAL_PRICE_REFERENCES: PERSONAL }),
    environment({ NEXT_PUBLIC_PADDLE_ADVANCED_PRICE_REFERENCES: ADVANCED }),
  ])(
    "rejects unavailable or unsafe configuration without reflecting it",
    (value) => {
      expect(() => loadBillingWebhookConfiguration(value)).toThrow(
        BillingWebhookConfigurationError,
      );
      try {
        loadBillingWebhookConfiguration(value);
      } catch (error) {
        expect(String(error)).toBe(
          "BillingWebhookConfigurationError: Billing webhook configuration is unavailable.",
        );
        expect(String(error)).not.toContain(SECRET);
        expect(String(error)).not.toContain("billing:local");
      }
    },
  );
});
