import "server-only";

import {
  BILLING_WEBHOOK_MAXIMUM_BYTES,
  BILLING_WEBHOOK_MAXIMUM_HEADERS,
  type BillingWebhookDisposition,
} from "@/server/billing-webhook-contracts";
import {
  productionPaddleWebhookService,
  type PaddleWebhookService,
} from "@/server/paddle-webhook-service";

const MAXIMUM_HEADER_NAME_LENGTH = 128;
const MAXIMUM_HEADER_VALUE_LENGTH = 8 * 1024;

export const PADDLE_WEBHOOK_RESPONSE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()",
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
});

type PaddleWebhookServiceProvider = () => Pick<PaddleWebhookService, "process">;

export function createPaddleWebhookHttpHandler(
  getService: PaddleWebhookServiceProvider = productionPaddleWebhookService,
) {
  return async function POST(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return response(405, "method-not-allowed", { Allow: "POST" });
    if (!jsonContentType(request.headers.get("content-type")))
      return response(415, "unsupported-media-type");

    const declaredLength = contentLength(request.headers.get("content-length"));
    if (declaredLength === "invalid") return response(400, "rejected");
    if (
      declaredLength !== null &&
      declaredLength > BILLING_WEBHOOK_MAXIMUM_BYTES
    )
      return response(413, "payload-too-large");

    const headers = collectHeaders(request.headers);
    if (!headers) return response(400, "rejected");

    const rawBody = await readBoundedBody(request.body);
    if (rawBody === null) return response(413, "payload-too-large");
    if (rawBody === "failed") return response(400, "rejected");

    let disposition: BillingWebhookDisposition;
    try {
      disposition = await getService().process({ rawBody, headers });
    } catch {
      return response(503, "unavailable");
    }
    return dispositionResponse(disposition);
  };
}

function dispositionResponse(disposition: BillingWebhookDisposition): Response {
  if (disposition.disposition === "acknowledge")
    return response(disposition.statusCode, "accepted");
  if (disposition.disposition === "reject")
    return response(disposition.statusCode, "rejected");
  return response(disposition.statusCode, "unavailable");
}

function response(
  status: number,
  state:
    | "accepted"
    | "rejected"
    | "unavailable"
    | "method-not-allowed"
    | "unsupported-media-type"
    | "payload-too-large",
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify({ status: state }), {
    status,
    headers: { ...PADDLE_WEBHOOK_RESPONSE_HEADERS, ...extraHeaders },
  });
}

function jsonContentType(value: string | null): boolean {
  return (
    value !== null &&
    /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value)
  );
}

function contentLength(value: string | null): number | "invalid" | null {
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return "invalid";
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : "invalid";
}

function collectHeaders(
  source: Headers,
): Readonly<Record<string, string>> | null {
  const entries = [...source.entries()];
  if (entries.length < 1 || entries.length > BILLING_WEBHOOK_MAXIMUM_HEADERS)
    return null;
  for (const [name, value] of entries) {
    if (
      name.length < 1 ||
      name.length > MAXIMUM_HEADER_NAME_LENGTH ||
      value.length > MAXIMUM_HEADER_VALUE_LENGTH ||
      /[\0\r\n]/.test(value)
    )
      return null;
  }
  const signature = source.get("paddle-signature");
  return Object.freeze(
    signature === null ? {} : { "paddle-signature": signature },
  );
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
): Promise<Uint8Array | "failed" | null> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const read = await reader.read();
      if (read.done) break;
      if (!(read.value instanceof Uint8Array)) return "failed";
      total += read.value.byteLength;
      if (total > BILLING_WEBHOOK_MAXIMUM_BYTES) {
        await cancel(reader);
        return null;
      }
      chunks.push(new Uint8Array(read.value));
    }
  } catch {
    return "failed";
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function cancel(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The rejection response is independent of client-stream cancellation.
  }
}
