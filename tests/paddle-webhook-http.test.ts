import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";

vi.mock("server-only", () => ({}));

import type { AccountId } from "@/infrastructure/auth/account";
import {
  BILLING_WEBHOOK_MAXIMUM_BYTES,
  type BillingWebhookDisposition,
} from "@/server/billing-webhook-contracts";
import { processBillingWebhook } from "@/server/billing-webhook-orchestrator";
import {
  PADDLE_WEBHOOK_RESPONSE_HEADERS,
  createPaddleWebhookHttpHandler,
} from "@/server/paddle-webhook-http";
import {
  PADDLE_BILLING_ADAPTER_VERSION,
  createPaddleBillingProviderAdapter,
} from "@/server/paddle-billing-provider-adapter";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const SECRET = `pdl_ntfset_${"s".repeat(40)}`;
const PRICE = `pri_${"p".repeat(26)}`;
const EVENT_ID = `evt_${"e".repeat(26)}`;
const CUSTOMER_ID = `ctm_${"c".repeat(26)}`;
const SUBSCRIPTION_ID = `sub_${"s".repeat(26)}`;
const OWNER_ID = "10000000-0000-4000-8000-000000000001" as AccountId;

function disposition(
  kind: "acknowledge" | "reject" | "retry",
): BillingWebhookDisposition {
  if (kind === "acknowledge")
    return Object.freeze({
      version: "1.0.0",
      disposition: kind,
      statusCode: 200,
      code: "processed",
    });
  if (kind === "reject")
    return Object.freeze({
      version: "1.0.0",
      disposition: kind,
      statusCode: 400,
      code: "verification-rejected",
    });
  return Object.freeze({
    version: "1.0.0",
    disposition: kind,
    statusCode: 503,
    code: "owner-unavailable",
  });
}

function handler(
  process: (request: unknown) => Promise<BillingWebhookDisposition>,
) {
  return createPaddleWebhookHttpHandler(() => ({ process }));
}

function request(
  body: BodyInit | null = "{}",
  overrides: Readonly<{ method?: string; headers?: HeadersInit }> = {},
) {
  return new Request("https://app.example.test/api/webhooks/paddle", {
    method: overrides.method ?? "POST",
    headers: overrides.headers ?? {
      "content-type": "application/json",
      "paddle-signature": "ts=1000000000;h1=placeholder",
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function signedPayload() {
  return {
    event_id: EVENT_ID,
    notification_id: `ntf_${"n".repeat(26)}`,
    event_type: "subscription.updated",
    occurred_at: "2026-08-11T11:59:59.000Z",
    data: {
      id: SUBSCRIPTION_ID,
      status: "active",
      customer_id: CUSTOMER_ID,
      started_at: "2026-08-01T00:00:00.000Z",
      current_billing_period: {
        starts_at: "2026-08-01T00:00:00.000Z",
        ends_at: "2026-09-01T00:00:00.000Z",
      },
      billing_cycle: { interval: "month", frequency: 1 },
      items: [
        {
          status: "active",
          quantity: 1,
          recurring: true,
          price: { id: PRICE },
        },
      ],
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Paddle webhook HTTP boundary", () => {
  it("exposes only a dynamic Node POST Route Handler with framework hardening", async () => {
    const route = await import("@/app/api/webhooks/paddle/route");
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(typeof route.POST).toBe("function");
    expect(Object.hasOwn(route, "GET")).toBe(false);

    const rules = await nextConfig.headers!();
    const rule = rules.find(
      (candidate) => candidate.source === "/api/webhooks/paddle",
    );
    expect(rule?.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "Cache-Control",
          value: expect.stringContaining("no-store"),
        }),
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
      ]),
    );
  });

  it("verifies one locally signed HTTP request through the complete pipeline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const rawBody = JSON.stringify(signedPayload());
    const timestamp = Math.floor(NOW.getTime() / 1_000).toString();
    const signature = createHmac("sha256", SECRET)
      .update(`${timestamp}:${rawBody}`)
      .digest("hex");
    const resolveOwner = vi.fn(async () => OWNER_ID);
    const applyNormalizedEvent = vi.fn(async () => ({
      outcome: "applied" as const,
      changed: true,
      entitlementState: null,
    }));
    const adapter = createPaddleBillingProviderAdapter({
      version: PADDLE_BILLING_ADAPTER_VERSION,
      webhookSecret: SECRET,
      priceReferences: {
        personal: [PRICE],
        advanced: [`pri_${"a".repeat(26)}`],
      },
    });
    const response = await handler((value) =>
      processBillingWebhook(value, {
        adapter,
        accountResolver: { resolveOwner },
        subscriptionWriter: { applyNormalizedEvent },
        clock: { now: () => new Date(NOW) },
      }),
    )(
      request(rawBody, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "paddle-signature": `ts=${timestamp};h1=${signature}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(resolveOwner).toHaveBeenCalledWith("paddle", CUSTOMER_ID);
    expect(applyNormalizedEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["acknowledge", 200, "accepted"],
    ["reject", 400, "rejected"],
    ["retry", 503, "unavailable"],
  ] as const)(
    "maps %s without exposing internal disposition detail",
    async (kind, status, state) => {
      const body = `{"private":"${CUSTOMER_ID}"}`;
      const response = await handler(async () => disposition(kind))(
        request(body),
      );
      expect(response.status).toBe(status);
      const responseBody = await response.text();
      expect(responseBody).toBe(JSON.stringify({ status: state }));
      expect(responseBody).not.toContain(CUSTOMER_ID);
    },
  );

  it("sets the complete no-store and response-hardening header set", async () => {
    const response = await handler(async () => disposition("acknowledge"))(
      request(),
    );
    for (const [name, value] of Object.entries(PADDLE_WEBHOOK_RESPONSE_HEADERS))
      expect(response.headers.get(name)).toBe(value);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([
    [request(null, { method: "GET" }), 405, "method-not-allowed"],
    [request("{}", { headers: {} }), 415, "unsupported-media-type"],
    [
      request("{}", { headers: { "content-type": "text/plain" } }),
      415,
      "unsupported-media-type",
    ],
    [
      request("{}", {
        headers: { "content-type": "application/json; charset=latin1" },
      }),
      415,
      "unsupported-media-type",
    ],
    [
      request("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": "invalid",
        },
      }),
      400,
      "rejected",
    ],
    [
      request("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": String(BILLING_WEBHOOK_MAXIMUM_BYTES + 1),
        },
      }),
      413,
      "payload-too-large",
    ],
  ] as const)(
    "rejects invalid HTTP requests before service dispatch",
    async (input, status, state) => {
      const process = vi.fn(async () => disposition("acknowledge"));
      const response = await handler(process)(input);
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ status: state });
      expect(process).not.toHaveBeenCalled();
    },
  );

  it("streams up to the exact body limit and copies the bytes", async () => {
    const bytes = new Uint8Array(BILLING_WEBHOOK_MAXIMUM_BYTES).fill(97);
    const process = vi.fn(async (value: unknown) => {
      const input = value as { rawBody: Uint8Array };
      expect(input.rawBody).not.toBe(bytes);
      expect(input.rawBody).toEqual(bytes);
      return disposition("acknowledge");
    });
    const response = await handler(process)(
      request(bytes, { headers: { "content-type": "application/json" } }),
    );
    expect(response.status).toBe(200);
    expect(process).toHaveBeenCalledTimes(1);
  }, 10_000);

  it("projects only the required signature header into the billing pipeline", async () => {
    const process = vi.fn(async (value: unknown) => {
      expect(value).toMatchObject({
        headers: { "paddle-signature": "safe-signature" },
      });
      expect((value as { headers: Record<string, string> }).headers).toEqual({
        "paddle-signature": "safe-signature",
      });
      return disposition("acknowledge");
    });
    const response = await handler(process)(
      request("{}", {
        headers: {
          "content-type": "application/json",
          "paddle-signature": "safe-signature",
          authorization: "private-bearer",
          cookie: "private-session",
          "x-provider-debug": CUSTOMER_ID,
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(process).toHaveBeenCalledTimes(1);
  });

  it("cancels and rejects a streamed body as soon as it exceeds the limit", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(BILLING_WEBHOOK_MAXIMUM_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel,
    });
    const process = vi.fn(async () => disposition("acknowledge"));
    const response = await handler(process)(
      request(stream, { headers: { "content-type": "application/json" } }),
    );
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(process).not.toHaveBeenCalled();
  });

  it("rejects excessive headers and values before service dispatch", async () => {
    const tooMany = new Headers({
      "content-type": "application/json",
      "paddle-signature": "signature",
    });
    for (let index = 0; index < 63; index += 1)
      tooMany.set(`x-extra-${index}`, "value");
    const process = vi.fn(async () => disposition("acknowledge"));
    expect(
      (await handler(process)(request("{}", { headers: tooMany }))).status,
    ).toBe(400);
    expect(
      (
        await handler(process)(
          request("{}", {
            headers: {
              "content-type": "application/json",
              "x-large": "x".repeat(8 * 1024 + 1),
            },
          }),
        )
      ).status,
    ).toBe(400);
    expect(process).not.toHaveBeenCalled();
  });

  it("maps stream, configuration, and service failures to one safe retry response", async () => {
    const failedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error(`raw-${SECRET}`));
      },
    });
    const streamResponse = await handler(async () =>
      disposition("acknowledge"),
    )(
      request(failedStream, {
        headers: { "content-type": "application/json" },
      }),
    );
    expect(streamResponse.status).toBe(400);

    const unavailable = createPaddleWebhookHttpHandler(() => {
      throw new Error(`config-${SECRET}`);
    });
    const configResponse = await unavailable(request());
    expect(configResponse.status).toBe(503);
    const configBody = await configResponse.text();
    expect(configBody).toBe('{"status":"unavailable"}');

    const serviceResponse = await handler(async () => {
      throw new Error(`database-${CUSTOMER_ID}`);
    })(request());
    expect(serviceResponse.status).toBe(503);
    expect(await serviceResponse.text()).not.toContain(CUSTOMER_ID);
    expect(configBody).not.toContain(SECRET);
  });

  it("keeps concurrent request bodies and dispositions isolated", async () => {
    const seen: string[] = [];
    const process = vi.fn(async (value: unknown) => {
      const input = value as { rawBody: Uint8Array };
      const body = new TextDecoder().decode(input.rawBody);
      seen.push(body);
      await Promise.resolve();
      return disposition("acknowledge");
    });
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        handler(process)(request(JSON.stringify({ index }))),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(new Set(seen).size).toBe(12);
  });
});
