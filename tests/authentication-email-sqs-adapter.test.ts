import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import { describe, expect, it, vi } from "vitest";

import {
  createAuthenticationEmailSqsQueue,
  loadAuthenticationEmailSqsConfiguration,
} from "@/server/authentication-email-sqs-adapter";

const configuration = {
  version: "1.0.0" as const,
  region: "ca-central-1" as const,
  queueUrl:
    "https://sqs.ca-central-1.amazonaws.com/123456789012/astroligy-email-feedback",
};

describe("authentication email SQS adapter", () => {
  it("loads only an exact server-side Canada Central queue", () => {
    expect(
      loadAuthenticationEmailSqsConfiguration({
        SES_AUTH_EMAIL_REGION: "ca-central-1",
        SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL: configuration.queueUrl,
      }),
    ).toEqual(configuration);
    for (const environment of [
      {},
      {
        SES_AUTH_EMAIL_REGION: "us-east-1",
        SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL: configuration.queueUrl,
      },
      {
        SES_AUTH_EMAIL_REGION: "ca-central-1",
        SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL:
          "https://sqs.ca-central-1.amazonaws.com.attacker.test/123456789012/x-email-feedback",
      },
      {
        SES_AUTH_EMAIL_REGION: "ca-central-1",
        SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL: configuration.queueUrl,
        NEXT_PUBLIC_SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL: configuration.queueUrl,
      },
    ])
      expect(() =>
        loadAuthenticationEmailSqsConfiguration(environment),
      ).toThrow("Invalid authentication email SQS input");
  });

  it("uses bounded receive, visibility, and individual delete commands", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ReceiveMessageCommand)
        return {
          Messages: [
            {
              MessageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              ReceiptHandle: "private-receipt",
              Body: "private-provider-envelope",
              Attributes: {
                ApproximateReceiveCount: "2",
                SentTimestamp: "1787572800000",
              },
            },
          ],
        };
      return {};
    });
    const queue = createAuthenticationEmailSqsQueue({
      configuration,
      client: { send } as never,
    });
    const controller = new AbortController();
    await expect(
      queue.receive({
        maximumMessages: 10,
        waitTimeSeconds: 20,
        visibilityTimeoutSeconds: 60,
        signal: controller.signal,
      }),
    ).resolves.toEqual([
      {
        version: "1.0.0",
        messageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        receiptHandle: "private-receipt",
        body: "private-provider-envelope",
        approximateReceiveCount: 2,
        sentAt: new Date(1787572800000),
      },
    ]);
    await queue.extendVisibility("private-receipt", 60);
    await queue.delete("private-receipt");

    expect(send.mock.calls[0]![0]).toBeInstanceOf(ReceiveMessageCommand);
    expect((send.mock.calls[0]![0] as ReceiveMessageCommand).input).toEqual({
      QueueUrl: configuration.queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 60,
      MessageSystemAttributeNames: ["ApproximateReceiveCount", "SentTimestamp"],
    });
    expect(send.mock.calls[1]![0]).toBeInstanceOf(
      ChangeMessageVisibilityCommand,
    );
    expect(send.mock.calls[2]![0]).toBeInstanceOf(DeleteMessageCommand);
    expect(JSON.stringify(send.mock.calls.slice(1))).toContain(
      "private-receipt",
    );
  });

  it.each([
    { Messages: [{ Body: "missing identities", Attributes: {} }] },
    {
      Messages: [
        {
          MessageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          ReceiptHandle: "receipt",
          Body: "x".repeat(256 * 1024 + 1),
          Attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "1787572800000",
          },
        },
      ],
    },
  ])("rejects malformed or oversized provider output", async (response) => {
    const queue = createAuthenticationEmailSqsQueue({
      configuration,
      client: { send: vi.fn(async () => response) } as never,
    });
    await expect(
      queue.receive({
        maximumMessages: 10,
        waitTimeSeconds: 20,
        visibilityTimeoutSeconds: 60,
      }),
    ).rejects.toThrow("Invalid authentication email SQS input");
  });
});
