import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type SQSClientConfig,
} from "@aws-sdk/client-sqs";

import type {
  AuthenticationEmailFeedbackQueue,
  AuthenticationEmailFeedbackQueueMessage,
} from "./authentication-email-feedback-worker";

export type AuthenticationEmailSqsConfiguration = Readonly<{
  version: "1.0.0";
  region: "ca-central-1";
  queueUrl: string;
}>;

export type AuthenticationEmailSqsCommandClient = Pick<SQSClient, "send">;

export function loadAuthenticationEmailSqsConfiguration(
  environment: NodeJS.ProcessEnv | Record<string, unknown>,
): AuthenticationEmailSqsConfiguration {
  if (!record(environment)) invalid();
  if (
    Object.entries(environment).some(
      ([name, value]) =>
        name.startsWith("NEXT_PUBLIC_SES_AUTH_EMAIL_FEEDBACK_QUEUE") &&
        typeof value === "string" &&
        value.length > 0,
    )
  )
    invalid();
  return validateConfiguration({
    version: "1.0.0",
    region: environment.SES_AUTH_EMAIL_REGION,
    queueUrl: environment.SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL,
  });
}

export function createAuthenticationEmailSqsQueue(input: {
  readonly configuration: AuthenticationEmailSqsConfiguration;
  readonly client?: AuthenticationEmailSqsCommandClient;
}): AuthenticationEmailFeedbackQueue {
  if (!record(input)) invalid();
  const configuration = validateConfiguration(input.configuration);
  const client =
    input.client ??
    new SQSClient({ region: configuration.region } satisfies SQSClientConfig);
  if (!record(client) || typeof client.send !== "function") invalid();

  const queue: AuthenticationEmailFeedbackQueue = Object.freeze({
    async receive(request: {
      readonly maximumMessages: number;
      readonly waitTimeSeconds: number;
      readonly visibilityTimeoutSeconds: number;
      readonly signal?: AbortSignal;
    }) {
      const response = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: configuration.queueUrl,
          MaxNumberOfMessages: request.maximumMessages,
          WaitTimeSeconds: request.waitTimeSeconds,
          VisibilityTimeout: request.visibilityTimeoutSeconds,
          MessageSystemAttributeNames: [
            "ApproximateReceiveCount",
            "SentTimestamp",
          ],
        }),
        request.signal === undefined
          ? undefined
          : { abortSignal: request.signal },
      );
      return Object.freeze(
        (response.Messages ?? []).map((message) => normalizeMessage(message)),
      );
    },
    async delete(receiptHandle: string) {
      validateReceiptHandle(receiptHandle);
      await client.send(
        new DeleteMessageCommand({
          QueueUrl: configuration.queueUrl,
          ReceiptHandle: receiptHandle,
        }),
      );
    },
    async extendVisibility(
      receiptHandle: string,
      visibilityTimeoutSeconds: number,
    ) {
      validateReceiptHandle(receiptHandle);
      if (
        !Number.isSafeInteger(visibilityTimeoutSeconds) ||
        visibilityTimeoutSeconds < 30 ||
        visibilityTimeoutSeconds > 43_200
      )
        invalid();
      await client.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: configuration.queueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: visibilityTimeoutSeconds,
        }),
      );
    },
  });
  return queue;
}

function normalizeMessage(value: {
  MessageId?: string | undefined;
  ReceiptHandle?: string | undefined;
  Body?: string | undefined;
  Attributes?: Record<string, string | undefined> | undefined;
}): AuthenticationEmailFeedbackQueueMessage {
  if (
    typeof value.MessageId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.MessageId,
    ) ||
    typeof value.ReceiptHandle !== "string" ||
    typeof value.Body !== "string"
  )
    invalid();
  validateReceiptHandle(value.ReceiptHandle);
  if (Buffer.byteLength(value.Body, "utf8") > 256 * 1024) invalid();
  const receiveCount = Number(value.Attributes?.ApproximateReceiveCount);
  const sentAtMilliseconds = Number(value.Attributes?.SentTimestamp);
  if (
    !Number.isSafeInteger(receiveCount) ||
    receiveCount < 1 ||
    receiveCount > 1_000 ||
    !Number.isSafeInteger(sentAtMilliseconds) ||
    sentAtMilliseconds < 0
  )
    invalid();
  const sentAt = new Date(sentAtMilliseconds);
  if (!Number.isFinite(sentAt.getTime())) invalid();
  return Object.freeze({
    version: "1.0.0",
    messageId: value.MessageId,
    receiptHandle: value.ReceiptHandle,
    body: value.Body,
    approximateReceiveCount: receiveCount,
    sentAt,
  });
}

function validateConfiguration(
  value: unknown,
): AuthenticationEmailSqsConfiguration {
  if (
    !record(value) ||
    !hasExactKeys(value, ["version", "region", "queueUrl"]) ||
    value.version !== "1.0.0" ||
    value.region !== "ca-central-1" ||
    typeof value.queueUrl !== "string"
  )
    invalid();
  let url: URL;
  try {
    url = new URL(value.queueUrl);
  } catch {
    invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "sqs.ca-central-1.amazonaws.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !/^\/\d{12}\/[A-Za-z0-9_-]{1,80}-email-feedback$/.test(url.pathname)
  )
    invalid();
  return Object.freeze({
    version: "1.0.0",
    region: "ca-central-1",
    queueUrl: url.toString(),
  });
}

function validateReceiptHandle(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096)
    invalid();
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function invalid(): never {
  throw new TypeError("Invalid authentication email SQS input");
}
