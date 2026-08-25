import { LocalAuthenticationEmailFeedbackQueue } from "../src/server/authentication-email-feedback-local-queue.ts";
import { createAuthenticationEmailFeedbackWorker } from "../src/server/authentication-email-feedback-worker.ts";

const sentAt = new Date("2026-08-24T12:00:00.000Z");
const queue = new LocalAuthenticationEmailFeedbackQueue(
  ["acknowledge", "retry", "reconcile"].map((disposition, index) => ({
    version: "1.0.0" as const,
    messageId: `${index + 1}`.repeat(8) + "-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    receiptHandle: `local-receipt-${index + 1}`,
    body: disposition,
    approximateReceiveCount: 1,
    sentAt,
  })),
);

const worker = createAuthenticationEmailFeedbackWorker({
  queue,
  processor: {
    async process(value) {
      const body = (value as { body?: unknown }).body;
      const disposition =
        body === "acknowledge"
          ? "acknowledge"
          : body === "retry"
            ? "retry"
            : "reconcile";
      return Object.freeze({
        version: "1.0.0" as const,
        disposition,
        code:
          disposition === "acknowledge"
            ? ("FEEDBACK_PROCESSED" as const)
            : disposition === "retry"
              ? ("FEEDBACK_RETRY" as const)
              : ("FEEDBACK_RECONCILIATION_REQUIRED" as const),
      });
    },
  },
  clock: () => new Date("2026-08-24T12:01:00.000Z"),
});

const cycle = await worker.runCycle();
const snapshot = queue.snapshot();
if (
  cycle.acknowledged !== 1 ||
  cycle.retried !== 1 ||
  cycle.reconciled !== 1 ||
  snapshot.deleted !== 1
)
  throw new Error("Local feedback worker contract failed");

process.stdout.write(`${JSON.stringify({ cycle, queue: snapshot })}\n`);
