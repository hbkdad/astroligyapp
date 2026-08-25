import type {
  AuthenticationEmailFeedbackQueue,
  AuthenticationEmailFeedbackQueueMessage,
} from "./authentication-email-feedback-worker";

export class LocalAuthenticationEmailFeedbackQueue implements AuthenticationEmailFeedbackQueue {
  readonly #messages: AuthenticationEmailFeedbackQueueMessage[];
  readonly #deleted = new Set<string>();
  readonly #extensions: Readonly<{
    receiptHandle: string;
    visibilityTimeoutSeconds: number;
  }>[] = [];

  constructor(messages: readonly AuthenticationEmailFeedbackQueueMessage[]) {
    this.#messages = [...messages];
  }

  async receive(input: {
    readonly maximumMessages: number;
    readonly waitTimeSeconds: number;
    readonly visibilityTimeoutSeconds: number;
    readonly signal?: AbortSignal;
  }) {
    if (input.signal?.aborted) throw new Error("aborted");
    return Object.freeze(
      this.#messages
        .filter((message) => !this.#deleted.has(message.receiptHandle))
        .slice(0, input.maximumMessages),
    );
  }

  async delete(receiptHandle: string) {
    if (!this.#messages.some((value) => value.receiptHandle === receiptHandle))
      throw new Error("unknown receipt");
    this.#deleted.add(receiptHandle);
  }

  async extendVisibility(
    receiptHandle: string,
    visibilityTimeoutSeconds: number,
  ) {
    if (!this.#messages.some((value) => value.receiptHandle === receiptHandle))
      throw new Error("unknown receipt");
    this.#extensions.push(
      Object.freeze({ receiptHandle, visibilityTimeoutSeconds }),
    );
  }

  snapshot() {
    return Object.freeze({
      version: "1.0.0" as const,
      deleted: this.#deleted.size,
      visibilityExtensions: this.#extensions.length,
      remaining: this.#messages.length - this.#deleted.size,
    });
  }
}
