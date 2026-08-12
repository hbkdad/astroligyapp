import { createPaddleWebhookHttpHandler } from "@/server/paddle-webhook-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createPaddleWebhookHttpHandler();
