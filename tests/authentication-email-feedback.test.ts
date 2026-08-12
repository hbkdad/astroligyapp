import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AuthenticationEmailFeedbackError,
  AuthenticationEmailFeedbackRepository,
  createAuthenticationEmailFeedbackProcessor,
  loadAuthenticationEmailFeedbackConfiguration,
  type AuthenticationEmailFeedbackConfiguration,
} from "@/server/authentication-email-feedback";

const KEY = createHash("sha256").update("feedback-key").digest("base64url");
const configuration: AuthenticationEmailFeedbackConfiguration = {
  keys: [{ version: 1, value: KEY }],
  topicArn: "arn:aws:sns:ca-central-1:123456789012:authentication-feedback",
  identityArn:
    "arn:aws:ses:ca-central-1:123456789012:identity/auth.example.test",
  sender: "security@auth.example.test",
  configurationSet: "authentication-events",
};

function mail() {
  return {
    timestamp: "2026-08-12T12:00:00.000Z",
    source: configuration.sender,
    sourceArn: configuration.identityArn,
    sendingAccountId: "123456789012",
    messageId: "ses-message-001",
    destination: ["person@example.test"],
    headersTruncated: false,
    tags: { "ses:configuration-set": [configuration.configurationSet] },
  };
}

function sesEvent(type = "Delivery"): Record<string, unknown> {
  const details: Record<string, unknown> = {
    Delivery: {
      delivery: {
        timestamp: "2026-08-12T12:00:02.000Z",
        processingTimeMillis: 2000,
        recipients: ["person@example.test"],
        smtpResponse: "250 accepted private diagnostic",
        reportingMTA: "a1.smtp-out.amazonses.com",
        remoteMtaIp: "192.0.2.10",
      },
    },
    Bounce: {
      bounce: {
        bounceType: "Permanent",
        bounceSubType: "General",
        bouncedRecipients: [
          {
            emailAddress: "person@example.test",
            action: "failed",
            status: "5.1.1",
            diagnosticCode: "private bounce diagnostic",
          },
        ],
        timestamp: "2026-08-12T12:01:00.000Z",
        feedbackId: "bounce-feedback-1",
      },
    },
    Complaint: {
      complaint: {
        complainedRecipients: [{ emailAddress: "person@example.test" }],
        timestamp: "2026-08-12T12:02:00.000Z",
        feedbackId: "complaint-feedback-1",
        complaintFeedbackType: "abuse",
      },
    },
    Reject: { reject: { reason: "Bad content" } },
    DeliveryDelay: {
      deliveryDelay: {
        timestamp: "2026-08-12T12:03:00.000Z",
        delayType: "MailboxFull",
        expirationTime: "2026-08-13T12:03:00.000Z",
        delayedRecipients: [
          {
            emailAddress: "person@example.test",
            status: "4.2.2",
            diagnosticCode: "private delay diagnostic",
          },
        ],
        reportingMTA: "192.0.2.20",
      },
    },
    "Rendering Failure": {
      failure: {
        templateName: "unused-provider-template",
        errorMessage: "private rendering diagnostic",
      },
    },
  };
  return {
    eventType: type,
    mail: mail(),
    ...((details[type] ?? {}) as Record<string, unknown>),
  };
}

function queueMessage(event: unknown = sesEvent()) {
  const envelope = {
    Type: "Notification",
    MessageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    TopicArn: configuration.topicArn,
    Message: JSON.stringify(event),
    Timestamp: "2026-08-12T12:00:03.000Z",
    SignatureVersion: "2",
    Signature: Buffer.alloc(64, 7).toString("base64"),
    SigningCertURL:
      "https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-test.pem",
    UnsubscribeURL:
      "https://sns.ca-central-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn%3Aaws%3Asns%3Aca-central-1%3A123456789012%3Aauthentication-feedback%3Acccccccc-cccc-4ccc-8ccc-cccccccccccc",
  };
  return {
    messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    body: JSON.stringify(envelope),
  };
}

function fixture(
  outcome: "applied" | "stale" | "unmatched" | "duplicate" = "applied",
) {
  const verify = vi.fn(async () => true);
  const process = vi.fn(async () => outcome);
  return {
    processor: createAuthenticationEmailFeedbackProcessor({
      configuration,
      authenticator: { verify },
      repository: { process } as never,
    }),
    verify,
    process,
  };
}

describe("authentication email feedback normalization", () => {
  it.each([
    ["Delivery", "delivery", false],
    ["Bounce", "bounce", true],
    ["Complaint", "complaint", true],
    ["Reject", "reject", false],
    ["DeliveryDelay", "delay", false],
    ["Rendering Failure", "render-failure", false],
  ])(
    "normalizes authenticated %s without returning provider content",
    async (source, type, permanent) => {
      const value = fixture();
      const result = await value.processor.process(
        queueMessage(sesEvent(source)),
      );
      expect(result).toEqual({
        version: "1.0.0",
        disposition: "acknowledge",
        code: "FEEDBACK_PROCESSED",
      });
      expect(value.verify).toHaveBeenCalledOnce();
      expect(value.process).toHaveBeenCalledWith(
        expect.objectContaining({
          version: "1.0.0",
          eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          providerMessageReference: "ses-message-001",
          type,
          recipient: "person@example.test",
          permanent,
        }),
      );
      expect(JSON.stringify(result)).not.toMatch(
        /person|diagnostic|ses-message|smtp|192\.0\.2/,
      );
    },
  );

  it("acknowledges duplicates and reconciles unmatched authenticated events", async () => {
    await expect(
      fixture("duplicate").processor.process(queueMessage()),
    ).resolves.toEqual({
      version: "1.0.0",
      disposition: "acknowledge",
      code: "FEEDBACK_DUPLICATE",
    });
    await expect(
      fixture("unmatched").processor.process(queueMessage()),
    ).resolves.toEqual({
      version: "1.0.0",
      disposition: "reconcile",
      code: "FEEDBACK_RECONCILIATION_REQUIRED",
    });
  });

  it("retries only transient authenticator or repository failures", async () => {
    const authentication = fixture();
    authentication.verify.mockRejectedValueOnce(
      new Error("private certificate failure"),
    );
    await expect(
      authentication.processor.process(queueMessage()),
    ).resolves.toMatchObject({ disposition: "retry", code: "FEEDBACK_RETRY" });
    expect(authentication.process).not.toHaveBeenCalled();

    const persistence = fixture();
    persistence.process.mockRejectedValueOnce(
      new Error("private database failure"),
    );
    await expect(
      persistence.processor.process(queueMessage()),
    ).resolves.toMatchObject({ disposition: "retry", code: "FEEDBACK_RETRY" });
  });

  it("fails closed before persistence for unauthenticated, malformed, and hostile envelopes", async () => {
    const cases: unknown[] = [
      {},
      { ...queueMessage(), extra: true },
      { ...queueMessage(), messageId: "not-a-uuid" },
      (() => {
        const value = queueMessage();
        const envelope = JSON.parse(value.body);
        envelope.TopicArn = "arn:aws:sns:us-east-1:123456789012:wrong";
        return { ...value, body: JSON.stringify(envelope) };
      })(),
      (() => {
        const event = sesEvent();
        (event.mail as Record<string, unknown>).destination = [
          "other@example.test",
        ];
        return queueMessage(event);
      })(),
      queueMessage({ ...sesEvent(), extra: "raw-payload-extension" }),
      queueMessage(sesEvent("Open")),
    ];
    for (const candidate of cases) {
      const value = fixture();
      await expect(value.processor.process(candidate)).resolves.toMatchObject({
        disposition: "reconcile",
        code: "FEEDBACK_RECONCILIATION_REQUIRED",
      });
      expect(value.process).not.toHaveBeenCalled();
    }

    const unsigned = fixture();
    unsigned.verify.mockResolvedValueOnce(false);
    await expect(
      unsigned.processor.process(queueMessage()),
    ).resolves.toMatchObject({ disposition: "reconcile" });
    expect(unsigned.process).not.toHaveBeenCalled();
  });
});

describe("authentication email feedback configuration", () => {
  it("loads exact server-only configuration and retained HMAC keys", () => {
    expect(
      loadAuthenticationEmailFeedbackConfiguration({
        AUTH_EMAIL_FEEDBACK_KEYS: `1:${KEY}`,
        SES_AUTH_EMAIL_FEEDBACK_TOPIC_ARN: configuration.topicArn,
        SES_AUTH_EMAIL_IDENTITY_ARN: configuration.identityArn,
        SES_AUTH_EMAIL_FROM: configuration.sender,
        SES_AUTH_EMAIL_CONFIGURATION_SET: configuration.configurationSet,
      }),
    ).toEqual(configuration);
  });

  it.each([
    {},
    { ...configuration, topicArn: "arn:aws:sns:us-east-1:123456789012:x" },
    {
      ...configuration,
      identityArn: "arn:aws:ses:ca-central-1:999999999999:identity/x",
    },
    { ...configuration, sender: "Upper@Example.test" },
    { ...configuration, keys: [{ version: 1, value: "short" }] },
  ])(
    "rejects missing, cross-region, mismatched, or malformed configuration",
    (value) => {
      expect(() =>
        createAuthenticationEmailFeedbackProcessor({
          configuration: value as never,
          authenticator: { verify: vi.fn() },
          repository: { process: vi.fn() } as never,
        }),
      ).toThrow(AuthenticationEmailFeedbackError);
    },
  );

  it("rejects browser-exposed feedback keys", () => {
    expect(() =>
      loadAuthenticationEmailFeedbackConfiguration({
        AUTH_EMAIL_FEEDBACK_KEYS: `1:${KEY}`,
        SES_AUTH_EMAIL_FEEDBACK_TOPIC_ARN: configuration.topicArn,
        SES_AUTH_EMAIL_IDENTITY_ARN: configuration.identityArn,
        SES_AUTH_EMAIL_FROM: configuration.sender,
        SES_AUTH_EMAIL_CONFIGURATION_SET: configuration.configurationSet,
        NEXT_PUBLIC_AUTH_EMAIL_FEEDBACK_KEYS: KEY,
      }),
    ).toThrow(AuthenticationEmailFeedbackError);
  });
});

describe("authentication email suppression repository", () => {
  it("checks all retained keyed recipient digests without sending the recipient to SQL", async () => {
    const query = vi.fn(async (statement: string, parameters?: unknown[]) => ({
      rows: [],
      rowCount: statement.includes("authentication_email_suppression")
        ? 1
        : null,
      parameters,
    }));
    const release = vi.fn();
    const repository = new AuthenticationEmailFeedbackRepository(
      { connect: async () => ({ query, release }) as never },
      configuration,
    );
    await expect(repository.isSuppressed("person@example.test")).resolves.toBe(
      true,
    );
    expect(JSON.stringify(query.mock.calls)).not.toContain(
      "person@example.test",
    );
    expect(JSON.stringify(query.mock.calls)).toMatch(
      /hmac-sha256:1:[0-9a-f]{64}/,
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and sanitizes no database detail itself when a transaction fails", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("authentication_email_suppression"))
        throw new Error("private@example.test database detail");
      return { rows: [], rowCount: null };
    });
    const release = vi.fn();
    const repository = new AuthenticationEmailFeedbackRepository(
      { connect: async () => ({ query, release }) as never },
      configuration,
    );
    await expect(
      repository.isSuppressed("person@example.test"),
    ).rejects.toThrow("private@example.test database detail");
    expect(query.mock.calls.map(([statement]) => statement)).toContain(
      "rollback",
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it.each([
    ["accepted", "delivery", false, "delivered", "applied"],
    ["accepted", "bounce", false, "transient-bounce", "applied"],
    ["accepted", "bounce", true, "permanent-bounce", "applied"],
    ["accepted", "complaint", true, "complaint", "applied"],
    ["accepted", "reject", false, "provider-rejected", "applied"],
    ["accepted", "delay", false, "delivery-delayed", "applied"],
    ["accepted", "render-failure", false, "rendering-failed", "applied"],
    ["complaint", "delivery", false, "complaint", "stale"],
    ["permanent-bounce", "complaint", true, "complaint", "applied"],
    ["delivered", "bounce", false, "delivered", "stale"],
  ] as const)(
    "persists safe transition %s plus %s as %s",
    async (initial, type, permanent, expectedState, expectedOutcome) => {
      let state: string = initial;
      let suppressionCount = 0;
      const query = vi.fn(async (statement: string, parameters?: unknown[]) => {
        if (
          statement.includes("authentication_email_feedback_receipt") &&
          statement.includes("select 1")
        )
          return { rows: [], rowCount: 0 };
        if (statement.includes("where provider_message_reference"))
          return { rows: [{ id: "delivery-row", state }], rowCount: 1 };
        if (
          statement.includes("authentication_email_suppression") &&
          statement.includes("select 1")
        )
          return { rows: [], rowCount: suppressionCount };
        if (statement.includes("insert into authentication_email_suppression"))
          suppressionCount += 1;
        if (statement.includes("update authentication_email_delivery"))
          state = String(parameters![1]);
        return { rows: [], rowCount: null };
      });
      const repository = new AuthenticationEmailFeedbackRepository(
        { connect: async () => ({ query, release: vi.fn() }) as never },
        configuration,
        () => new Date("2026-08-12T14:00:00.000Z"),
      );
      await expect(
        repository.process({
          version: "1.0.0",
          eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          providerMessageReference: "ses-message-001",
          type,
          occurredAt: new Date("2026-08-12T13:59:00.000Z"),
          recipient: "person@example.test",
          permanent,
        } as never),
      ).resolves.toBe(expectedOutcome);
      expect(state).toBe(expectedState);
      expect(JSON.stringify(query.mock.calls)).not.toContain(
        "person@example.test",
      );
      expect(suppressionCount).toBe(permanent ? 1 : 0);
    },
  );

  it("returns duplicate or unmatched without storing raw provider identity", async () => {
    const run = async (duplicate: boolean) => {
      const query = vi.fn(async (statement: string) => {
        if (
          statement.includes("authentication_email_feedback_receipt") &&
          statement.includes("select 1")
        )
          return { rows: duplicate ? [{}] : [], rowCount: duplicate ? 1 : 0 };
        if (statement.includes("where provider_message_reference"))
          return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: null };
      });
      const repository = new AuthenticationEmailFeedbackRepository(
        { connect: async () => ({ query, release: vi.fn() }) as never },
        configuration,
      );
      const outcome = await repository.process({
        version: "1.0.0",
        eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        providerMessageReference: "private-provider-reference",
        type: "delivery",
        occurredAt: new Date("2026-08-12T13:59:00.000Z"),
        recipient: "person@example.test",
        permanent: false,
      } as never);
      return { outcome, query };
    };
    expect((await run(true)).outcome).toBe("duplicate");
    const unmatched = await run(false);
    expect(unmatched.outcome).toBe("unmatched");
    const receiptCall = unmatched.query.mock.calls.find(([statement]) =>
      statement.includes("insert into authentication_email_feedback_receipt"),
    );
    expect(JSON.stringify(receiptCall)).not.toContain(
      "private-provider-reference",
    );
    expect(JSON.stringify(receiptCall)).not.toContain("person@example.test");
  });
});
