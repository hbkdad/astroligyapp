import { afterEach, describe, expect, it, vi } from "vitest";

const poolState = vi.hoisted(() => ({
  constructions: [] as unknown[],
  end: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({
  Pool: class {
    constructor(options: unknown) {
      poolState.constructions.push(options);
    }

    end = poolState.end;
  },
}));

import type { BillingWebhookConfiguration } from "@/server/billing-webhook-configuration";
import {
  createPaddleWebhookService,
  productionPaddleWebhookService,
} from "@/server/paddle-webhook-service";

const SECRET = `pdl_ntfset_${"s".repeat(40)}`;
const PERSONAL = `pri_${"p".repeat(26)}`;
const ADVANCED = `pri_${"a".repeat(26)}`;
const configuration: BillingWebhookConfiguration = {
  version: "1.0.0",
  databaseUrl: "postgresql://billing:local@127.0.0.1:5432/cosmic",
  paddle: {
    version: "1.0.0",
    webhookSecret: SECRET,
    priceReferences: { personal: [PERSONAL], advanced: [ADVANCED] },
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  poolState.end.mockClear();
});

describe("Paddle webhook service composition", () => {
  it("creates a bounded pool and closes it exactly once", async () => {
    const service = createPaddleWebhookService(configuration);
    expect(Object.isFrozen(service)).toBe(true);
    expect(poolState.constructions.at(-1)).toEqual({
      connectionString: configuration.databaseUrl,
      max: 8,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 30_000,
      allowExitOnIdle: true,
    });

    await service.close();
    await service.close();
    expect(poolState.end).toHaveBeenCalledTimes(1);
    await expect(service.process({})).rejects.toThrow(
      "Billing webhook service is unavailable",
    );
  });

  it("returns one process singleton for concurrent production access", () => {
    vi.stubEnv("DATABASE_URL", configuration.databaseUrl);
    vi.stubEnv("PADDLE_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("PADDLE_PERSONAL_PRICE_REFERENCES", PERSONAL);
    vi.stubEnv("PADDLE_ADVANCED_PRICE_REFERENCES", ADVANCED);

    const first = productionPaddleWebhookService();
    const services = Array.from({ length: 16 }, () =>
      productionPaddleWebhookService(),
    );
    expect(services.every((service) => service === first)).toBe(true);
  });
});
