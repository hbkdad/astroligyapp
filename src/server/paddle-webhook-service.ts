import "server-only";

import { Pool } from "pg";

import { BillingCustomerOwnerResolver } from "@/infrastructure/persistence/billing-customer-binding-repository";
import { SubscriptionRepository } from "@/infrastructure/persistence/subscription-repository";
import type { BillingWebhookDisposition } from "@/server/billing-webhook-contracts";
import {
  loadBillingWebhookConfiguration,
  type BillingWebhookConfiguration,
} from "@/server/billing-webhook-configuration";
import { processBillingWebhook } from "@/server/billing-webhook-orchestrator";
import { createPaddleBillingProviderAdapter } from "@/server/paddle-billing-provider-adapter";

export interface PaddleWebhookService {
  process(request: unknown): Promise<BillingWebhookDisposition>;
  close(): Promise<void>;
}

export function createPaddleWebhookService(
  configuration: BillingWebhookConfiguration,
): PaddleWebhookService {
  const pool = new Pool({
    connectionString: configuration.databaseUrl,
    max: 8,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  });
  const dependencies = Object.freeze({
    adapter: createPaddleBillingProviderAdapter(configuration.paddle),
    accountResolver: new BillingCustomerOwnerResolver(pool),
    subscriptionWriter: new SubscriptionRepository(pool),
    clock: Object.freeze({ now: () => new Date() }),
  });
  let closed = false;

  return Object.freeze({
    async process(request: unknown) {
      if (closed) throw new Error("Billing webhook service is unavailable");
      return processBillingWebhook(request, dependencies);
    },
    async close() {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  });
}

let processService: PaddleWebhookService | undefined;

export function productionPaddleWebhookService(): PaddleWebhookService {
  if (processService) return processService;
  const configuration = loadBillingWebhookConfiguration(process.env);
  processService = createPaddleWebhookService(configuration);
  return processService;
}
