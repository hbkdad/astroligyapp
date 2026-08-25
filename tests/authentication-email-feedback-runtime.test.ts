import { createHash, generateKeyPairSync } from "node:crypto";

import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createAuthenticationEmailFeedbackRuntime } from "@/server/authentication-email-feedback-runtime";

const KEY = createHash("sha256")
  .update("runtime-feedback-key")
  .digest("base64url");

describe("authentication email feedback runtime composition", () => {
  it("wires the queue, signature, processor, and repository without contacting AWS", async () => {
    const send = vi.fn<(command: unknown) => Promise<{ Messages: never[] }>>(
      async () => ({ Messages: [] }),
    );
    const connect = vi.fn();
    const publicKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    }).publicKey;
    const runtime = createAuthenticationEmailFeedbackRuntime({
      environment: {
        AUTH_EMAIL_FEEDBACK_KEYS: `1:${KEY}`,
        SES_AUTH_EMAIL_REGION: "ca-central-1",
        SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL:
          "https://sqs.ca-central-1.amazonaws.com/123456789012/astroligy-email-feedback",
        SES_AUTH_EMAIL_FEEDBACK_TOPIC_ARN:
          "arn:aws:sns:ca-central-1:123456789012:authentication-feedback",
        SES_AUTH_EMAIL_IDENTITY_ARN:
          "arn:aws:ses:ca-central-1:123456789012:identity/auth.example.test",
        SES_AUTH_EMAIL_FROM: "security@auth.example.test",
        SES_AUTH_EMAIL_CONFIGURATION_SET: "authentication-events",
      },
      pool: { connect } as never,
      certificateAuthority: {
        async loadTrustedCertificate() {
          return {
            version: "1.0.0",
            publicKey,
            chainVerified: true,
            dnsNames: ["sns.amazonaws.com"],
            validFrom: new Date("2026-08-23T00:00:00.000Z"),
            validTo: new Date("2026-08-25T00:00:00.000Z"),
          };
        },
      },
      sqsClient: { send } as never,
      clock: () => new Date("2026-08-24T12:00:00.000Z"),
    });
    await expect(runtime.runCycle()).resolves.toMatchObject({
      disposition: "completed",
      received: 0,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toBeInstanceOf(ReceiveMessageCommand);
    expect(connect).not.toHaveBeenCalled();
  });
});
