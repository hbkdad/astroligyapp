import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AccountId } from "@/infrastructure/auth/account";
import {
  SubscriptionIdentityConflictError,
  type StoredSubscriptionTransitionResult,
} from "@/infrastructure/persistence/subscription-repository";
import {
  SUBSCRIPTION_TRANSITION_EVENT_VERSION,
  type NormalizedSubscriptionEvent,
  type SubscriptionTransitionOutcome,
} from "@/domain/entitlements/subscription-transitions";
import type {
  BillingAccountResolver,
  BillingProviderAdapter,
  BillingSubscriptionWriter,
  BillingWebhookAdapterResult,
} from "@/server/billing-webhook-contracts";
import { processBillingWebhook } from "@/server/billing-webhook-orchestrator";

const OWNER_ID = "10000000-0000-4000-8000-000000000001" as AccountId;
const RECEIVED_AT = "2026-08-11T12:00:00.000Z";
const SIGNED_AT = "2026-08-11T11:58:00.000Z";

function event(
  overrides: Partial<NormalizedSubscriptionEvent> = {},
): NormalizedSubscriptionEvent {
  return {
    version: SUBSCRIPTION_TRANSITION_EVENT_VERSION,
    eventId: "evt_verified_001",
    occurredAt: SIGNED_AT,
    planKey: "personal",
    status: "active",
    periodStartsAt: "2026-08-01T00:00:00.000Z",
    periodEndsAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function request(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    rawBody: new TextEncoder().encode('{"private":"provider-payload"}'),
    headers: {
      "X-Test-Signature": "valid-signature-secret",
      "X-Test-Timestamp": SIGNED_AT,
    },
    ...overrides,
  };
}

function fakeAdapter(
  override?: (
    request: Parameters<BillingProviderAdapter["verifyAndNormalize"]>[0],
  ) => Promise<BillingWebhookAdapterResult>,
): BillingProviderAdapter {
  return {
    providerKey: "test_payments",
    async verifyAndNormalize(adapterRequest) {
      if (override) return override(adapterRequest);
      if (
        adapterRequest.headers["x-test-signature"] !== "valid-signature-secret"
      )
        return { status: "rejected", reason: "invalid-signature" };
      const signedAt = Date.parse(
        adapterRequest.headers["x-test-timestamp"] ?? "",
      );
      if (
        !Number.isFinite(signedAt) ||
        Date.parse(adapterRequest.receivedAt) - signedAt > 5 * 60 * 1000
      )
        return { status: "rejected", reason: "stale" };
      return {
        status: "verified",
        identity: {
          provider: "test_payments",
          customerReference: "customer_verified",
          subscriptionReference: "subscription_verified",
        },
        event: event(),
      };
    },
  };
}

function stored(
  outcome: SubscriptionTransitionOutcome = "applied",
): StoredSubscriptionTransitionResult {
  return {
    outcome,
    changed: outcome === "applied",
    entitlementState: null,
  };
}

function dependencies(
  overrides: {
    adapter?: BillingProviderAdapter;
    accountResolver?: BillingAccountResolver;
    subscriptionWriter?: BillingSubscriptionWriter;
    clock?: { now(): Date };
  } = {},
) {
  return {
    adapter: overrides.adapter ?? fakeAdapter(),
    accountResolver:
      overrides.accountResolver ??
      ({
        resolveOwner: vi.fn(async () => OWNER_ID),
      } satisfies BillingAccountResolver),
    subscriptionWriter:
      overrides.subscriptionWriter ??
      ({
        applyNormalizedEvent: vi.fn(async () => stored()),
      } satisfies BillingSubscriptionWriter),
    clock: overrides.clock ?? { now: () => new Date(RECEIVED_AT) },
  };
}

describe("provider-neutral billing webhook orchestration", () => {
  it("passes bounded cloned bytes and normalized headers through one verified flow", async () => {
    const rawRequest = request();
    const originalBody = rawRequest.rawBody as Uint8Array;
    const adapter = fakeAdapter(async (adapterRequest) => {
      expect(adapterRequest.receivedAt).toBe(RECEIVED_AT);
      expect(Object.keys(adapterRequest.headers)).toEqual([
        "x-test-signature",
        "x-test-timestamp",
      ]);
      expect(Object.isFrozen(adapterRequest.headers)).toBe(true);
      expect(adapterRequest.rawBody).not.toBe(originalBody);
      adapterRequest.rawBody[0] = 0;
      return {
        status: "verified",
        identity: {
          provider: "test_payments",
          customerReference: "customer_verified",
          subscriptionReference: "subscription_verified",
        },
        event: event(),
      };
    });
    const accountResolver = {
      resolveOwner: vi.fn(async () => OWNER_ID),
    } satisfies BillingAccountResolver;
    const subscriptionWriter = {
      applyNormalizedEvent: vi.fn(async () => stored()),
    } satisfies BillingSubscriptionWriter;
    const disposition = await processBillingWebhook(
      rawRequest,
      dependencies({ adapter, accountResolver, subscriptionWriter }),
    );
    expect(disposition).toEqual({
      version: "1.0.0",
      disposition: "acknowledge",
      statusCode: 200,
      code: "processed",
    });
    expect(Object.isFrozen(disposition)).toBe(true);
    expect(originalBody[0]).not.toBe(0);
    expect(accountResolver.resolveOwner).toHaveBeenCalledWith(
      "test_payments",
      "customer_verified",
    );
    expect(subscriptionWriter.applyNormalizedEvent).toHaveBeenCalledOnce();
  });

  it.each(["applied", "duplicate", "stale", "invalid-transition"] as const)(
    "acknowledges the safe persisted %s outcome",
    async (outcome) => {
      const disposition = await processBillingWebhook(
        request(),
        dependencies({
          subscriptionWriter: {
            async applyNormalizedEvent() {
              return stored(outcome);
            },
          },
        }),
      );
      expect(disposition).toMatchObject({
        disposition: "acknowledge",
        statusCode: 200,
        code: "processed",
      });
    },
  );

  it("acknowledges state conflicts without exposing identity", async () => {
    const disposition = await processBillingWebhook(
      request(),
      dependencies({
        subscriptionWriter: {
          async applyNormalizedEvent() {
            return stored("conflict");
          },
        },
      }),
    );
    expect(disposition).toEqual({
      version: "1.0.0",
      disposition: "acknowledge",
      statusCode: 200,
      code: "state-conflict",
    });
    expect(JSON.stringify(disposition)).not.toMatch(
      /customer_verified|subscription_verified|valid-signature-secret|provider-payload/,
    );
  });

  it.each([
    [
      { "X-Test-Signature": "wrong", "X-Test-Timestamp": SIGNED_AT },
      "invalid-signature",
    ],
    [
      {
        "X-Test-Signature": "valid-signature-secret",
        "X-Test-Timestamp": "2026-08-11T11:00:00.000Z",
      },
      "stale",
    ],
  ] as const)(
    "rejects fake-adapter %s verification failure",
    async (headers, reason) => {
      const accountResolver = {
        resolveOwner: vi.fn(async () => OWNER_ID),
      } satisfies BillingAccountResolver;
      const disposition = await processBillingWebhook(
        request({ headers }),
        dependencies({ accountResolver }),
      );
      expect(disposition).toMatchObject({
        disposition: "reject",
        statusCode: 400,
        code: "verification-rejected",
      });
      expect(["invalid-signature", "stale"]).toContain(reason);
      expect(accountResolver.resolveOwner).not.toHaveBeenCalled();
    },
  );

  it("retries adapter, clock, owner, and persistence availability failures", async () => {
    const cases = [
      dependencies({
        adapter: fakeAdapter(async () => {
          throw new Error("signature service unavailable");
        }),
      }),
      dependencies({
        clock: {
          now() {
            throw new Error("clock unavailable");
          },
        },
      }),
      dependencies({ clock: { now: () => new Date(NaN) } }),
      dependencies({
        accountResolver: {
          async resolveOwner() {
            throw new Error("mapping unavailable");
          },
        },
      }),
      dependencies({
        accountResolver: {
          async resolveOwner() {
            return null;
          },
        },
      }),
      dependencies({
        accountResolver: {
          async resolveOwner() {
            return "not-an-account-id" as AccountId;
          },
        },
      }),
      dependencies({
        subscriptionWriter: {
          async applyNormalizedEvent() {
            throw new Error("database unavailable");
          },
        },
      }),
    ];
    const expected = [
      "adapter-unavailable",
      "clock-unavailable",
      "clock-unavailable",
      "owner-unavailable",
      "owner-unavailable",
      "owner-unavailable",
      "persistence-unavailable",
    ];
    for (let index = 0; index < cases.length; index += 1) {
      expect(
        await processBillingWebhook(request(), cases[index]!),
      ).toMatchObject({
        disposition: "retry",
        statusCode: 503,
        code: expected[index],
      });
    }
  });

  it("acknowledges generic repository identity conflict to stop unsafe retry loops", async () => {
    const disposition = await processBillingWebhook(
      request(),
      dependencies({
        subscriptionWriter: {
          async applyNormalizedEvent() {
            throw new SubscriptionIdentityConflictError();
          },
        },
      }),
    );
    expect(disposition).toMatchObject({
      disposition: "acknowledge",
      code: "state-conflict",
    });
  });

  it.each([
    undefined,
    {},
    request({ extra: true }),
    request({ rawBody: new Uint8Array() }),
    request({ rawBody: new Uint8Array(256 * 1024 + 1) }),
    request({ headers: {} }),
    request({ headers: { "bad header": "value" } }),
    request({ headers: { Signature: "one", signature: "two" } }),
    request({
      headers: Object.fromEntries(
        Array.from({ length: 65 }, (_, i) => [`x-${i}`, "v"]),
      ),
    }),
    request({ headers: { signature: "x".repeat(8 * 1024 + 1) } }),
    request({ headers: { signature: 123 } }),
    request({ headers: { signature: "value\r\ninjected: true" } }),
  ])("rejects malformed or oversized raw request envelopes", async (value) => {
    const verifyAndNormalize = vi.fn(async () => ({
      status: "rejected" as const,
      reason: "malformed" as const,
    }));
    const adapter = {
      providerKey: "test_payments",
      verifyAndNormalize,
    } satisfies BillingProviderAdapter;
    expect(
      await processBillingWebhook(value, dependencies({ adapter })),
    ).toMatchObject({
      disposition: "reject",
      statusCode: 400,
      code: "invalid-request",
    });
    expect(verifyAndNormalize).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: "verified",
      identity: {
        provider: "wrong_provider",
        customerReference: "customer_verified",
        subscriptionReference: "subscription_verified",
      },
      event: event(),
    },
    {
      status: "verified",
      identity: {
        provider: "test_payments",
        customerReference: "customer_verified",
        subscriptionReference: "subscription_verified",
      },
      event: { ...event(), browserPlan: "advanced" },
    },
    { status: "rejected", reason: "private-reason" },
    { status: "rejected", reason: "stale", detail: "secret" },
  ])(
    "rejects malformed adapter contracts before owner resolution",
    async (result) => {
      const accountResolver = {
        resolveOwner: vi.fn(async () => OWNER_ID),
      } satisfies BillingAccountResolver;
      const adapter = fakeAdapter(
        async () => result as unknown as BillingWebhookAdapterResult,
      );
      expect(
        await processBillingWebhook(
          request(),
          dependencies({ adapter, accountResolver }),
        ),
      ).toMatchObject({
        disposition: "reject",
        code: "adapter-contract-invalid",
      });
      expect(accountResolver.resolveOwner).not.toHaveBeenCalled();
    },
  );

  it.each(["invalid-event", "invalid-current-state"] as const)(
    "handles impossible %s output from the persistence contract",
    async (outcome) => {
      expect(
        await processBillingWebhook(
          request(),
          dependencies({
            subscriptionWriter: {
              async applyNormalizedEvent() {
                return stored(outcome);
              },
            },
          }),
        ),
      ).toMatchObject(
        outcome === "invalid-event"
          ? { disposition: "reject", code: "adapter-contract-invalid" }
          : { disposition: "acknowledge", code: "state-conflict" },
      );
    },
  );

  it("retries malformed persistence output and rejects an invalid adapter key", async () => {
    const malformedWriter = {
      async applyNormalizedEvent() {
        return { outcome: "made-up", changed: true, entitlementState: null };
      },
    } as unknown as BillingSubscriptionWriter;
    expect(
      await processBillingWebhook(
        request(),
        dependencies({ subscriptionWriter: malformedWriter }),
      ),
    ).toMatchObject({ disposition: "retry", code: "persistence-unavailable" });

    const invalidAdapter = { ...fakeAdapter(), providerKey: "Bad Provider" };
    expect(
      await processBillingWebhook(
        request(),
        dependencies({ adapter: invalidAdapter }),
      ),
    ).toMatchObject({
      disposition: "reject",
      code: "adapter-contract-invalid",
    });
  });
});
