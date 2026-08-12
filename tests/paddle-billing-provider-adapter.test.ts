import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SDK_VERSION } from "@paddle/paddle-node-sdk";

vi.mock("server-only", () => ({}));

import type { AccountId } from "@/infrastructure/auth/account";
import type { BillingWebhookAdapterRequest } from "@/server/billing-webhook-contracts";
import { processBillingWebhook } from "@/server/billing-webhook-orchestrator";
import {
  PADDLE_BILLING_ADAPTER_VERSION,
  PADDLE_PROVIDER_KEY,
  PaddleBillingAdapterConfigurationError,
  createPaddleBillingProviderAdapter,
} from "@/server/paddle-billing-provider-adapter";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const SECRET = `pdl_ntfset_${"s".repeat(40)}`;
const PERSONAL_PRICE = `pri_${"p".repeat(26)}`;
const ADVANCED_PRICE = `pri_${"a".repeat(26)}`;
const EVENT_ID = `evt_${"e".repeat(26)}`;
const CUSTOMER_ID = `ctm_${"c".repeat(26)}`;
const SUBSCRIPTION_ID = `sub_${"s".repeat(26)}`;

function adapter() {
  return createPaddleBillingProviderAdapter({
    version: PADDLE_BILLING_ADAPTER_VERSION,
    webhookSecret: SECRET,
    priceReferences: {
      personal: [PERSONAL_PRICE],
      advanced: [ADVANCED_PRICE],
    },
  });
}

function payload(
  overrides: Record<string, unknown> = {},
  dataOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    event_id: EVENT_ID,
    notification_id: `ntf_${"n".repeat(26)}`,
    event_type: "subscription.updated",
    occurred_at: "2026-08-11T11:59:59.000Z",
    data: {
      id: SUBSCRIPTION_ID,
      status: "active",
      customer_id: CUSTOMER_ID,
      started_at: "2026-07-01T00:00:00.000Z",
      paused_at: null,
      canceled_at: null,
      billing_cycle: { interval: "month", frequency: 1 },
      current_billing_period: {
        starts_at: "2026-08-01T00:00:00.000Z",
        ends_at: "2026-09-01T00:00:00.000Z",
      },
      items: [
        {
          status: "active",
          quantity: 1,
          recurring: true,
          price: { id: PERSONAL_PRICE },
        },
      ],
      ...dataOverrides,
    },
    ...overrides,
  };
}

function signedRequest(
  value: unknown,
  options: Readonly<{
    signedAt?: Date;
    receivedAt?: string;
    secret?: string;
    rawBody?: Uint8Array;
    signature?: string;
  }> = {},
): BillingWebhookAdapterRequest {
  const rawBody =
    options.rawBody ?? new TextEncoder().encode(JSON.stringify(value));
  const body = new TextDecoder().decode(rawBody);
  const timestamp = Math.floor(
    (options.signedAt ?? NOW).getTime() / 1_000,
  ).toString();
  const digest = createHmac("sha256", options.secret ?? SECRET)
    .update(`${timestamp}:${body}`)
    .digest("hex");
  return {
    rawBody,
    headers: {
      "paddle-signature": options.signature ?? `ts=${timestamp};h1=${digest}`,
    },
    receivedAt: options.receivedAt ?? NOW.toISOString(),
  };
}

describe("Paddle billing provider adapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("pins the verified official SDK version", () => {
    expect(SDK_VERSION).toBe("3.10.0");
  });

  it.each([
    ["subscription.activated", "active"],
    ["subscription.canceled", "canceled"],
    ["subscription.created", "trialing"],
    ["subscription.past_due", "past_due"],
    ["subscription.paused", "paused"],
    ["subscription.resumed", "active"],
    ["subscription.trialing", "trialing"],
    ["subscription.updated", "active"],
  ])("verifies and maps allowlisted %s events", async (eventType, status) => {
    const result = await adapter().verifyAndNormalize(
      signedRequest(payload({ event_type: eventType }, { status })),
    );

    expect(result).toEqual({
      status: "verified",
      identity: {
        provider: PADDLE_PROVIDER_KEY,
        customerReference: CUSTOMER_ID,
        subscriptionReference: SUBSCRIPTION_ID,
      },
      event: {
        version: "1.0.0",
        eventId: EVENT_ID,
        occurredAt: "2026-08-11T11:59:59.000Z",
        planKey: "personal",
        status,
        periodStartsAt: "2026-08-01T00:00:00.000Z",
        periodEndsAt: "2026-09-01T00:00:00.000Z",
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status === "verified") {
      expect(Object.isFrozen(result.identity)).toBe(true);
      expect(Object.isFrozen(result.event)).toBe(true);
    }
  });

  it("maps only configured Advanced price references", async () => {
    const advancedItems = [
      {
        status: "active",
        quantity: 1,
        recurring: true,
        price: { id: ADVANCED_PRICE },
      },
    ];
    const result = await adapter().verifyAndNormalize(
      signedRequest(payload({}, { items: advancedItems })),
    );

    expect(result).toMatchObject({
      status: "verified",
      event: { planKey: "advanced" },
    });
  });

  it("flows one signed Paddle event through Goal 48 with fake owner and persistence boundaries", async () => {
    const signed = signedRequest(payload());
    const resolveOwner = vi.fn(
      async () => "10000000-0000-4000-8000-000000000001" as AccountId,
    );
    const applyNormalizedEvent = vi.fn(async () => ({
      outcome: "applied" as const,
      changed: true,
      entitlementState: null,
    }));

    await expect(
      processBillingWebhook(
        { rawBody: signed.rawBody, headers: signed.headers },
        {
          adapter: adapter(),
          accountResolver: { resolveOwner },
          subscriptionWriter: { applyNormalizedEvent },
          clock: { now: () => new Date(NOW) },
        },
      ),
    ).resolves.toEqual({
      version: "1.0.0",
      disposition: "acknowledge",
      statusCode: 200,
      code: "processed",
    });
    expect(resolveOwner).toHaveBeenCalledWith(PADDLE_PROVIDER_KEY, CUSTOMER_ID);
    expect(applyNormalizedEvent).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      {
        provider: PADDLE_PROVIDER_KEY,
        customerReference: CUSTOMER_ID,
        subscriptionReference: SUBSCRIPTION_ID,
      },
      expect.objectContaining({ eventId: EVENT_ID, planKey: "personal" }),
    );
  });

  it("normalizes Paddle RFC 3339 fractional precision into internal instants", async () => {
    const result = await adapter().verifyAndNormalize(
      signedRequest(
        payload(
          { occurred_at: "2026-08-11T11:59:59.52Z" },
          {
            current_billing_period: {
              starts_at: "2026-08-01T00:00:00Z",
              ends_at: "2026-09-01T00:00:00.123456Z",
            },
          },
        ),
      ),
    );

    expect(result).toMatchObject({
      status: "verified",
      event: {
        occurredAt: "2026-08-11T11:59:59.520Z",
        periodStartsAt: "2026-08-01T00:00:00.000Z",
        periodEndsAt: "2026-09-01T00:00:00.123Z",
      },
    });
  });

  it.each([
    [
      "subscription.paused",
      "paused",
      { paused_at: "2026-08-11T11:59:58.123456Z" },
      "2026-08-11T11:59:58.123Z",
    ],
    [
      "subscription.canceled",
      "canceled",
      { canceled_at: "2026-08-11T11:59:58.52Z" },
      "2026-08-11T11:59:58.520Z",
    ],
  ])(
    "maps official null-period %s payloads to access-ending periods",
    async (eventType, status, timestamps, expectedEnd) => {
      const result = await adapter().verifyAndNormalize(
        signedRequest(
          payload(
            { event_type: eventType },
            {
              status,
              current_billing_period: null,
              ...timestamps,
            },
          ),
        ),
      );

      expect(result).toMatchObject({
        status: "verified",
        event: {
          status,
          periodStartsAt: "2026-07-01T00:00:00.000Z",
          periodEndsAt: expectedEnd,
        },
      });
    },
  );

  it.each([
    ["wrong secret", signedRequest(payload(), { secret: `${SECRET}x` })],
    [
      "modified body",
      (() => {
        const original = signedRequest(payload());
        return {
          ...original,
          rawBody: new TextEncoder().encode(
            JSON.stringify(payload({}, { status: "paused" })),
          ),
        };
      })(),
    ],
    ["missing signature", { ...signedRequest(payload()), headers: {} }],
    [
      "malformed signature",
      signedRequest(payload(), { signature: "ts=invalid;h1=invalid" }),
    ],
  ])("rejects an invalid signature for %s", async (_label, request) => {
    await expect(adapter().verifyAndNormalize(request)).resolves.toEqual({
      status: "rejected",
      reason: "invalid-signature",
    });
  });

  it.each([
    [new Date(NOW.getTime() - 6_000), "old"],
    [new Date(NOW.getTime() + 6_000), "future"],
  ])(
    "rejects %s signatures outside the five-second window",
    async (signedAt) => {
      await expect(
        adapter().verifyAndNormalize(signedRequest(payload(), { signedAt })),
      ).resolves.toEqual({ status: "rejected", reason: "stale" });
    },
  );

  it("accepts both exact freshness boundaries", async () => {
    for (const offset of [-5_000, 5_000]) {
      const result = await adapter().verifyAndNormalize(
        signedRequest(payload(), {
          signedAt: new Date(NOW.getTime() + offset),
        }),
      );
      expect(result.status).toBe("verified");
    }
  });

  it.each([
    [
      "unsupported event",
      payload({ event_type: "transaction.completed" }),
      "unsupported",
    ],
    ["unknown status", payload({}, { status: "unpaid" }), "malformed"],
    [
      "wrong lifecycle status",
      payload({ event_type: "subscription.paused" }),
      "malformed",
    ],
    [
      "unknown customer",
      payload({}, { customer_id: "browser-customer" }),
      "malformed",
    ],
    [
      "unknown subscription",
      payload({}, { id: "browser-subscription" }),
      "malformed",
    ],
    [
      "unknown price",
      payload(
        {},
        {
          items: [
            {
              status: "active",
              quantity: 1,
              recurring: true,
              price: { id: `pri_${"z".repeat(26)}` },
            },
          ],
        },
      ),
      "malformed",
    ],
    [
      "missing active period",
      payload({}, { current_billing_period: null }),
      "malformed",
    ],
    [
      "reverse period",
      payload(
        {},
        {
          current_billing_period: {
            starts_at: "2026-09-01T00:00:00.000Z",
            ends_at: "2026-08-01T00:00:00.000Z",
          },
        },
      ),
      "malformed",
    ],
    ["multiple items", payload({}, { items: [{}, {}] }), "malformed"],
  ])("fails closed for %s", async (_label, value, reason) => {
    await expect(
      adapter().verifyAndNormalize(signedRequest(value)),
    ).resolves.toEqual({ status: "rejected", reason });
  });

  it("rejects signed malformed JSON and invalid UTF-8 without logging", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const invalidJson = new TextEncoder().encode("{");
    const invalidUtf8 = new Uint8Array([0xc3, 0x28]);

    await expect(
      adapter().verifyAndNormalize(
        signedRequest(null, { rawBody: invalidJson }),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "malformed" });
    await expect(
      adapter().verifyAndNormalize(
        signedRequest(null, { rawBody: invalidUtf8 }),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "malformed" });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("rejects invalid received instants before SDK verification", async () => {
    await expect(
      adapter().verifyAndNormalize(
        signedRequest(payload(), { receivedAt: "not-an-instant" }),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "malformed" });
  });

  it("fails verification when the trusted receipt clock disagrees with the SDK clock", async () => {
    const signedAt = new Date(NOW.getTime() - 10_000);
    await expect(
      adapter().verifyAndNormalize(
        signedRequest(payload(), {
          signedAt,
          receivedAt: signedAt.toISOString(),
        }),
      ),
    ).resolves.toEqual({
      status: "rejected",
      reason: "invalid-signature",
    });
  });

  it.each([
    ["missing event type", { event_id: EVENT_ID }],
    ["array event", []],
    ["invalid event id", payload({ event_id: "evt_invalid" })],
    ["invalid occurrence", payload({ occurred_at: "2026-02-30T00:00:00Z" })],
    ["invalid data", payload({}, { id: null })],
    ["missing customer", payload({}, { customer_id: null })],
    ["non-object period", payload({}, { current_billing_period: [] })],
    [
      "missing paused timestamp",
      payload(
        { event_type: "subscription.paused" },
        { status: "paused", current_billing_period: null, paused_at: null },
      ),
    ],
    [
      "missing canceled start",
      payload(
        { event_type: "subscription.canceled" },
        {
          status: "canceled",
          current_billing_period: null,
          canceled_at: "2026-08-11T11:59:58.000Z",
          started_at: null,
        },
      ),
    ],
    ["non-array items", payload({}, { items: null })],
    [
      "invalid item status",
      payload(
        {},
        {
          items: [
            {
              status: "unknown",
              quantity: 1,
              recurring: true,
              price: { id: PERSONAL_PRICE },
            },
          ],
        },
      ),
    ],
    [
      "non-recurring item",
      payload(
        {},
        {
          items: [
            {
              status: "active",
              quantity: 1,
              recurring: false,
              price: { id: PERSONAL_PRICE },
            },
          ],
        },
      ),
    ],
    [
      "wrong quantity",
      payload(
        {},
        {
          items: [
            {
              status: "active",
              quantity: 2,
              recurring: true,
              price: { id: PERSONAL_PRICE },
            },
          ],
        },
      ),
    ],
    [
      "missing price",
      payload(
        {},
        {
          items: [
            { status: "active", quantity: 1, recurring: true, price: null },
          ],
        },
      ),
    ],
    [
      "invalid price reference",
      payload(
        {},
        {
          items: [
            {
              status: "active",
              quantity: 1,
              recurring: true,
              price: { id: "pri_invalid" },
            },
          ],
        },
      ),
    ],
    [
      "invalid period start",
      payload(
        {},
        {
          current_billing_period: {
            starts_at: "not-an-instant",
            ends_at: "2026-09-01T00:00:00.000Z",
          },
        },
      ),
    ],
    [
      "invalid period end",
      payload(
        {},
        {
          current_billing_period: {
            starts_at: "2026-08-01T00:00:00.000Z",
            ends_at: "2026-02-30T00:00:00Z",
          },
        },
      ),
    ],
  ])("rejects additional malformed boundary: %s", async (_label, value) => {
    await expect(
      adapter().verifyAndNormalize(signedRequest(value)),
    ).resolves.toEqual({ status: "rejected", reason: "malformed" });
  });

  it.each([
    "ts=1786464000;ts=1786464000",
    `h1=${"a".repeat(64)};h1=${"b".repeat(64)}`,
    `ts=1786464000;h1=${"A".repeat(64)}`,
    `h1=${"a".repeat(64)};ts=01786464000`,
    `ts=1786464000;h1=${"a".repeat(64)};v=1`,
  ])("rejects non-current signature header shapes", async (signature) => {
    await expect(
      adapter().verifyAndNormalize(signedRequest(payload(), { signature })),
    ).resolves.toEqual({
      status: "rejected",
      reason: "invalid-signature",
    });
  });

  it.each([
    null,
    {},
    {
      version: PADDLE_BILLING_ADAPTER_VERSION,
      webhookSecret: "secret-leak-value",
      priceReferences: {
        personal: [PERSONAL_PRICE],
        advanced: [ADVANCED_PRICE],
      },
    },
    {
      version: PADDLE_BILLING_ADAPTER_VERSION,
      webhookSecret: SECRET,
      priceReferences: {
        personal: [PERSONAL_PRICE],
        advanced: [PERSONAL_PRICE],
      },
    },
    {
      version: PADDLE_BILLING_ADAPTER_VERSION,
      webhookSecret: SECRET,
      priceReferences: {
        personal: [],
        advanced: [ADVANCED_PRICE],
      },
    },
    {
      version: "2.0.0",
      webhookSecret: SECRET,
      priceReferences: {
        personal: [PERSONAL_PRICE],
        advanced: [ADVANCED_PRICE],
      },
    },
    {
      version: PADDLE_BILLING_ADAPTER_VERSION,
      webhookSecret: SECRET,
      priceReferences: {
        personal: ["pri_invalid"],
        advanced: [ADVANCED_PRICE],
      },
    },
    {
      version: PADDLE_BILLING_ADAPTER_VERSION,
      webhookSecret: SECRET,
      priceReferences: {
        personal: [PERSONAL_PRICE, PERSONAL_PRICE],
        advanced: [ADVANCED_PRICE],
      },
    },
    {
      version: PADDLE_BILLING_ADAPTER_VERSION,
      webhookSecret: SECRET,
      priceReferences: {
        personal: [PERSONAL_PRICE],
        advanced: [ADVANCED_PRICE],
      },
      extra: true,
    },
  ])("rejects invalid configuration without reflecting it", (configuration) => {
    expect(() => createPaddleBillingProviderAdapter(configuration)).toThrow(
      PaddleBillingAdapterConfigurationError,
    );
    try {
      createPaddleBillingProviderAdapter(configuration);
    } catch (error) {
      expect(String(error)).not.toContain(SECRET);
      expect(String(error)).not.toContain("secret-leak-value");
    }
  });
});
