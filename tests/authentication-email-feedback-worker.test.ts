import { describe, expect, it, vi } from "vitest";

import { LocalAuthenticationEmailFeedbackQueue } from "@/server/authentication-email-feedback-local-queue";
import {
  createAuthenticationEmailFeedbackWorker,
  type AuthenticationEmailFeedbackQueueMessage,
  type AuthenticationEmailFeedbackWorkerConfiguration,
} from "@/server/authentication-email-feedback-worker";

const NOW = new Date("2026-08-24T12:01:00.000Z");

function message(
  index: number,
  body: string,
): AuthenticationEmailFeedbackQueueMessage {
  return {
    version: "1.0.0",
    messageId: `${index}`.repeat(8) + "-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    receiptHandle: `private-receipt-${index}`,
    body,
    approximateReceiveCount: 1,
    sentAt: new Date("2026-08-24T12:00:00.000Z"),
  };
}

function result(disposition: "acknowledge" | "retry" | "reconcile") {
  return {
    version: "1.0.0" as const,
    disposition,
    code:
      disposition === "acknowledge"
        ? ("FEEDBACK_PROCESSED" as const)
        : disposition === "retry"
          ? ("FEEDBACK_RETRY" as const)
          : ("FEEDBACK_RECONCILIATION_REQUIRED" as const),
  };
}

function configuration(
  overrides: Partial<AuthenticationEmailFeedbackWorkerConfiguration> = {},
): AuthenticationEmailFeedbackWorkerConfiguration {
  return {
    version: "1.0.0",
    maximumMessages: 10,
    maximumConcurrency: 2,
    waitTimeSeconds: 20,
    visibilityTimeoutSeconds: 60,
    visibilityHeartbeatSeconds: 20,
    failureBackoffMilliseconds: 100,
    ...overrides,
  };
}

describe("authentication email feedback worker", () => {
  it("deletes only durable acknowledgements in a partial batch", async () => {
    const queue = new LocalAuthenticationEmailFeedbackQueue([
      message(1, "acknowledge"),
      message(2, "retry"),
      message(3, "reconcile"),
    ]);
    const process = vi.fn(async (value: unknown) => {
      const body = (value as { body: string }).body;
      return result(body as "acknowledge" | "retry" | "reconcile");
    });
    const worker = createAuthenticationEmailFeedbackWorker({
      queue,
      processor: { process },
      configuration: configuration(),
      clock: () => NOW,
    });

    await expect(worker.runCycle()).resolves.toEqual({
      version: "1.0.0",
      disposition: "completed",
      received: 3,
      acknowledged: 1,
      retried: 1,
      reconciled: 1,
      invalid: 0,
      deleteFailures: 0,
      visibilityFailures: 0,
      oldestMessageAgeSeconds: 60,
    });
    expect(queue.snapshot()).toEqual({
      version: "1.0.0",
      deleted: 1,
      visibilityExtensions: 0,
      remaining: 2,
    });
    expect(process.mock.calls).toEqual([
      [{ messageId: message(1, "").messageId, body: "acknowledge" }],
      [{ messageId: message(2, "").messageId, body: "retry" }],
      [{ messageId: message(3, "").messageId, body: "reconcile" }],
    ]);
    expect(JSON.stringify(await worker.runCycle())).not.toMatch(
      /private-receipt|private-provider-envelope|person@example/,
    );
  });

  it("fails malformed, duplicate-handle, and oversized queue outputs closed", async () => {
    const valid = message(1, "valid");
    const process = vi.fn(async () => result("acknowledge"));
    const queue = {
      receive: vi.fn(async () => [
        valid,
        { ...message(2, "duplicate"), receiptHandle: valid.receiptHandle },
        { ...message(3, "x"), body: "x".repeat(256 * 1024 + 1) },
        { ...message(4, "extra"), extra: true },
      ]),
      delete: vi.fn(async () => undefined),
      extendVisibility: vi.fn(async () => undefined),
    };
    const cycle = await createAuthenticationEmailFeedbackWorker({
      queue,
      processor: { process },
      configuration: configuration(),
      clock: () => NOW,
    }).runCycle();
    expect(cycle).toMatchObject({ received: 4, acknowledged: 1, invalid: 3 });
    expect(process).toHaveBeenCalledOnce();
    expect(queue.delete).toHaveBeenCalledOnce();
  });

  it("bounds concurrency and converts processor or delete failures into retries", async () => {
    let active = 0;
    let maximumActive = 0;
    const queue = {
      receive: vi.fn(async () => [
        message(1, "ok"),
        message(2, "throw"),
        message(3, "delete-fails"),
      ]),
      delete: vi.fn(async (receiptHandle: string) => {
        if (receiptHandle.endsWith("3"))
          throw new Error("private delete detail");
      }),
      extendVisibility: vi.fn(async () => undefined),
    };
    const processor = {
      async process(value: unknown) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        if ((value as { body: string }).body === "throw")
          throw new Error("private processor detail");
        return result("acknowledge");
      },
    };
    const cycle = await createAuthenticationEmailFeedbackWorker({
      queue,
      processor,
      configuration: configuration({ maximumConcurrency: 2 }),
      clock: () => NOW,
    }).runCycle();
    expect(maximumActive).toBe(2);
    expect(cycle).toMatchObject({
      acknowledged: 1,
      retried: 2,
      deleteFailures: 1,
    });
    expect(JSON.stringify(cycle)).not.toMatch(/private (processor|delete)/);
  });

  it("extends visibility during slow processing and reports heartbeat failure safely", async () => {
    vi.useFakeTimers();
    try {
      let resolve!: () => void;
      const pending = new Promise<void>((done) => {
        resolve = done;
      });
      const queue = {
        receive: vi.fn(async () => [message(1, "slow")]),
        delete: vi.fn(async () => undefined),
        extendVisibility: vi.fn(async () => {
          throw new Error("private visibility detail");
        }),
      };
      const cycle = createAuthenticationEmailFeedbackWorker({
        queue,
        processor: {
          async process() {
            await pending;
            return result("acknowledge");
          },
        },
        configuration: configuration({ visibilityHeartbeatSeconds: 5 }),
        clock: () => NOW,
      }).runCycle();
      await vi.advanceTimersByTimeAsync(5_000);
      resolve();
      await expect(cycle).resolves.toMatchObject({
        acknowledged: 1,
        visibilityFailures: 1,
      });
      expect(queue.extendVisibility).toHaveBeenCalledWith(
        "private-receipt-1",
        60,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops an aborted receive and backs off without exposing queue errors", async () => {
    const controller = new AbortController();
    const report = vi.fn();
    const sleep = vi.fn(async (_milliseconds: number, signal: AbortSignal) => {
      controller.abort();
      if (signal.aborted) throw new Error("aborted");
    });
    const worker = createAuthenticationEmailFeedbackWorker({
      queue: {
        receive: vi.fn(async () => {
          throw new Error("private queue endpoint and receipt");
        }),
        delete: vi.fn(),
        extendVisibility: vi.fn(),
      },
      processor: { process: vi.fn() },
      configuration: configuration(),
      sleep,
    });
    await expect(
      worker.run(controller.signal, report),
    ).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ disposition: "receive-failed", received: 0 }),
    );
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/endpoint|receipt/);
    await expect(worker.runCycle(controller.signal)).resolves.toMatchObject({
      disposition: "stopped",
    });
  });

  it.each([
    { ...configuration(), maximumMessages: 11 },
    { ...configuration(), maximumConcurrency: 0 },
    { ...configuration(), waitTimeSeconds: 21 },
    { ...configuration(), visibilityHeartbeatSeconds: 31 },
    { ...configuration(), failureBackoffMilliseconds: 1 },
  ])("rejects unsafe worker configuration", (candidate) => {
    expect(() =>
      createAuthenticationEmailFeedbackWorker({
        queue: new LocalAuthenticationEmailFeedbackQueue([]),
        processor: { process: vi.fn() },
        configuration: candidate,
      }),
    ).toThrow("Invalid authentication email feedback worker input");
  });
});
