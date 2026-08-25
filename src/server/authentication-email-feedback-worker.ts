import type { AuthenticationEmailFeedbackResult } from "./authentication-email-feedback";

const MAX_QUEUE_BODY_BYTES = 256 * 1024;
const MAX_RECEIPT_HANDLE_LENGTH = 4096;

export type AuthenticationEmailFeedbackQueueMessage = Readonly<{
  version: "1.0.0";
  messageId: string;
  receiptHandle: string;
  body: string;
  approximateReceiveCount: number;
  sentAt: Date;
}>;

export interface AuthenticationEmailFeedbackQueue {
  receive(input: {
    readonly maximumMessages: number;
    readonly waitTimeSeconds: number;
    readonly visibilityTimeoutSeconds: number;
    readonly signal?: AbortSignal;
  }): Promise<unknown>;
  delete(receiptHandle: string): Promise<void>;
  extendVisibility(
    receiptHandle: string,
    visibilityTimeoutSeconds: number,
  ): Promise<void>;
}

export interface AuthenticationEmailFeedbackMessageProcessor {
  process(value: unknown): Promise<AuthenticationEmailFeedbackResult>;
}

export type AuthenticationEmailFeedbackWorkerConfiguration = Readonly<{
  version: "1.0.0";
  maximumMessages: number;
  maximumConcurrency: number;
  waitTimeSeconds: number;
  visibilityTimeoutSeconds: number;
  visibilityHeartbeatSeconds: number;
  failureBackoffMilliseconds: number;
}>;

export type AuthenticationEmailFeedbackWorkerCycle = Readonly<{
  version: "1.0.0";
  disposition: "completed" | "receive-failed" | "stopped";
  received: number;
  acknowledged: number;
  retried: number;
  reconciled: number;
  invalid: number;
  deleteFailures: number;
  visibilityFailures: number;
  oldestMessageAgeSeconds: number | null;
}>;

type MessageOutcome = Readonly<{
  disposition: "acknowledged" | "retry" | "reconcile" | "invalid";
  deleteFailed: boolean;
  visibilityFailed: boolean;
}>;

export const DEFAULT_AUTHENTICATION_EMAIL_FEEDBACK_WORKER_CONFIGURATION =
  Object.freeze({
    version: "1.0.0" as const,
    maximumMessages: 10,
    maximumConcurrency: 4,
    waitTimeSeconds: 20,
    visibilityTimeoutSeconds: 60,
    visibilityHeartbeatSeconds: 20,
    failureBackoffMilliseconds: 1_000,
  });

export function createAuthenticationEmailFeedbackWorker(input: {
  readonly queue: AuthenticationEmailFeedbackQueue;
  readonly processor: AuthenticationEmailFeedbackMessageProcessor;
  readonly configuration?: AuthenticationEmailFeedbackWorkerConfiguration;
  readonly clock?: () => Date;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}) {
  if (!record(input) || !queue(input.queue) || !processor(input.processor))
    invalid();
  const configuration = validateConfiguration(
    input.configuration ??
      DEFAULT_AUTHENTICATION_EMAIL_FEEDBACK_WORKER_CONFIGURATION,
  );
  const clock = input.clock ?? (() => new Date());
  const sleep = input.sleep ?? abortableSleep;
  validDate(clock());

  async function runCycle(
    signal: AbortSignal = new AbortController().signal,
  ): Promise<AuthenticationEmailFeedbackWorkerCycle> {
    if (!(signal instanceof AbortSignal)) invalid();
    if (signal.aborted) return emptyCycle("stopped");

    let received: unknown;
    try {
      received = await input.queue.receive({
        maximumMessages: configuration.maximumMessages,
        waitTimeSeconds: configuration.waitTimeSeconds,
        visibilityTimeoutSeconds: configuration.visibilityTimeoutSeconds,
        signal,
      });
    } catch {
      return emptyCycle(signal.aborted ? "stopped" : "receive-failed");
    }
    if (signal.aborted) return emptyCycle("stopped");

    const parsed = validateBatch(received, configuration.maximumMessages);
    const outcomes = await mapConcurrent(
      parsed.messages,
      configuration.maximumConcurrency,
      (message) =>
        processMessage(message, input.queue, input.processor, configuration),
    );
    const now = validDate(clock()).getTime();
    const oldest = parsed.messages.reduce<number | null>((value, message) => {
      const age = Math.max(
        0,
        Math.floor((now - message.sentAt.getTime()) / 1_000),
      );
      return value === null ? age : Math.max(value, age);
    }, null);
    return Object.freeze({
      version: "1.0.0",
      disposition: "completed",
      received: parsed.messages.length + parsed.invalid,
      acknowledged: outcomes.filter(
        (value) => value.disposition === "acknowledged",
      ).length,
      retried: outcomes.filter((value) => value.disposition === "retry").length,
      reconciled: outcomes.filter((value) => value.disposition === "reconcile")
        .length,
      invalid: parsed.invalid,
      deleteFailures: outcomes.filter((value) => value.deleteFailed).length,
      visibilityFailures: outcomes.filter((value) => value.visibilityFailed)
        .length,
      oldestMessageAgeSeconds: oldest,
    });
  }

  async function run(
    signal: AbortSignal,
    report: (cycle: AuthenticationEmailFeedbackWorkerCycle) => void,
  ): Promise<void> {
    if (!(signal instanceof AbortSignal) || typeof report !== "function")
      invalid();
    while (!signal.aborted) {
      const cycle = await runCycle(signal);
      report(cycle);
      if (cycle.disposition === "stopped") return;
      if (cycle.disposition === "receive-failed") {
        try {
          await sleep(configuration.failureBackoffMilliseconds, signal);
        } catch {
          return;
        }
      }
    }
  }

  return Object.freeze({ runCycle, run, configuration });
}

async function processMessage(
  message: AuthenticationEmailFeedbackQueueMessage,
  queueClient: AuthenticationEmailFeedbackQueue,
  messageProcessor: AuthenticationEmailFeedbackMessageProcessor,
  configuration: AuthenticationEmailFeedbackWorkerConfiguration,
): Promise<MessageOutcome> {
  let visibilityFailed = false;
  let pendingHeartbeat: Promise<void> = Promise.resolve();
  const timer = setInterval(() => {
    pendingHeartbeat = pendingHeartbeat
      .then(() =>
        queueClient.extendVisibility(
          message.receiptHandle,
          configuration.visibilityTimeoutSeconds,
        ),
      )
      .catch(() => {
        visibilityFailed = true;
      });
  }, configuration.visibilityHeartbeatSeconds * 1_000);
  timer.unref?.();

  let result: AuthenticationEmailFeedbackResult;
  try {
    result = await messageProcessor.process({
      messageId: message.messageId,
      body: message.body,
    });
  } catch {
    result = Object.freeze({
      version: "1.0.0",
      disposition: "retry",
      code: "FEEDBACK_RETRY",
    });
  } finally {
    clearInterval(timer);
    await pendingHeartbeat;
  }

  if (result.disposition !== "acknowledge")
    return Object.freeze({
      disposition: result.disposition === "retry" ? "retry" : "reconcile",
      deleteFailed: false,
      visibilityFailed,
    });

  try {
    await queueClient.delete(message.receiptHandle);
    return Object.freeze({
      disposition: "acknowledged",
      deleteFailed: false,
      visibilityFailed,
    });
  } catch {
    return Object.freeze({
      disposition: "retry",
      deleteFailed: true,
      visibilityFailed,
    });
  }
}

function validateBatch(
  value: unknown,
  maximumMessages: number,
): Readonly<{
  messages: readonly AuthenticationEmailFeedbackQueueMessage[];
  invalid: number;
}> {
  if (!Array.isArray(value) || value.length > maximumMessages)
    return Object.freeze({ messages: Object.freeze([]), invalid: 1 });
  const messages: AuthenticationEmailFeedbackQueueMessage[] = [];
  let invalidCount = 0;
  const receiptHandles = new Set<string>();
  for (const candidate of value) {
    try {
      const message = validateMessage(candidate);
      if (receiptHandles.has(message.receiptHandle)) invalid();
      receiptHandles.add(message.receiptHandle);
      messages.push(message);
    } catch {
      invalidCount += 1;
    }
  }
  return Object.freeze({
    messages: Object.freeze(messages),
    invalid: invalidCount,
  });
}

function validateMessage(
  value: unknown,
): AuthenticationEmailFeedbackQueueMessage {
  if (
    !record(value) ||
    !hasExactKeys(value, [
      "version",
      "messageId",
      "receiptHandle",
      "body",
      "approximateReceiveCount",
      "sentAt",
    ]) ||
    value.version !== "1.0.0" ||
    typeof value.messageId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.messageId,
    ) ||
    typeof value.receiptHandle !== "string" ||
    value.receiptHandle.length === 0 ||
    value.receiptHandle.length > MAX_RECEIPT_HANDLE_LENGTH ||
    typeof value.body !== "string" ||
    Buffer.byteLength(value.body, "utf8") > MAX_QUEUE_BODY_BYTES ||
    !Number.isSafeInteger(value.approximateReceiveCount) ||
    Number(value.approximateReceiveCount) < 1 ||
    Number(value.approximateReceiveCount) > 1_000 ||
    !(value.sentAt instanceof Date)
  )
    invalid();
  const sentAt = validDate(value.sentAt);
  return Object.freeze({
    version: "1.0.0",
    messageId: value.messageId,
    receiptHandle: value.receiptHandle,
    body: value.body,
    approximateReceiveCount: Number(value.approximateReceiveCount),
    sentAt,
  });
}

async function mapConcurrent<T, U>(
  values: readonly T[],
  concurrency: number,
  work: (value: T) => Promise<U>,
): Promise<readonly U[]> {
  const results = new Array<U>(values.length);
  let cursor = 0;
  async function consume() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await work(values[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, consume),
  );
  return Object.freeze(results);
}

function validateConfiguration(
  value: AuthenticationEmailFeedbackWorkerConfiguration,
): AuthenticationEmailFeedbackWorkerConfiguration {
  if (
    !exactRecord(value, [
      "version",
      "maximumMessages",
      "maximumConcurrency",
      "waitTimeSeconds",
      "visibilityTimeoutSeconds",
      "visibilityHeartbeatSeconds",
      "failureBackoffMilliseconds",
    ]) ||
    value.version !== "1.0.0" ||
    !integerBetween(value.maximumMessages, 1, 10) ||
    !integerBetween(value.maximumConcurrency, 1, value.maximumMessages) ||
    !integerBetween(value.waitTimeSeconds, 1, 20) ||
    !integerBetween(value.visibilityTimeoutSeconds, 30, 43_200) ||
    !integerBetween(value.visibilityHeartbeatSeconds, 5, 300) ||
    value.visibilityHeartbeatSeconds * 2 > value.visibilityTimeoutSeconds ||
    !integerBetween(value.failureBackoffMilliseconds, 100, 60_000)
  )
    invalid();
  return Object.freeze({ ...value });
}

function emptyCycle(
  disposition: "receive-failed" | "stopped",
): AuthenticationEmailFeedbackWorkerCycle {
  return Object.freeze({
    version: "1.0.0",
    disposition,
    received: 0,
    acknowledged: 0,
    retried: 0,
    reconciled: 0,
    invalid: 0,
    deleteFailures: 0,
    visibilityFailures: 0,
    oldestMessageAgeSeconds: null,
  });
}

function abortableSleep(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

function queue(value: unknown): value is AuthenticationEmailFeedbackQueue {
  return (
    record(value) &&
    typeof value.receive === "function" &&
    typeof value.delete === "function" &&
    typeof value.extendVisibility === "function"
  );
}

function processor(
  value: unknown,
): value is AuthenticationEmailFeedbackMessageProcessor {
  return record(value) && typeof value.process === "function";
}

function integerBetween(value: unknown, minimum: number, maximum: number) {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}

function validDate(value: Date) {
  if (!Number.isFinite(value.getTime())) invalid();
  return new Date(value.getTime());
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactRecord(value: unknown, keys: readonly string[]) {
  return record(value) && hasExactKeys(value, keys);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function invalid(): never {
  throw new TypeError("Invalid authentication email feedback worker input");
}
