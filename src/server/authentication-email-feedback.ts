import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import type { Pool, PoolClient } from "pg";

const EVENT_DOMAIN = "authentication-email-feedback-event-v1";
const RECIPIENT_DOMAIN = "authentication-email-suppression-recipient-v1";
const MAX_QUEUE_BODY_BYTES = 256 * 1024;

export type AuthenticationEmailFeedbackType =
  "delivery" | "bounce" | "complaint" | "reject" | "delay" | "render-failure";

export interface AuthenticationEmailFeedbackKey {
  readonly version: number;
  readonly value: string;
}

export interface AuthenticationEmailFeedbackConfiguration {
  readonly keys: readonly AuthenticationEmailFeedbackKey[];
  readonly topicArn: string;
  readonly identityArn: string;
  readonly sender: string;
  readonly configurationSet: string;
}

export type AuthenticationEmailFeedbackResult = Readonly<{
  version: "1.0.0";
  disposition: "acknowledge" | "retry" | "reconcile";
  code:
    | "FEEDBACK_PROCESSED"
    | "FEEDBACK_DUPLICATE"
    | "FEEDBACK_RETRY"
    | "FEEDBACK_RECONCILIATION_REQUIRED";
}>;

export interface AuthenticationEmailFeedbackAuthenticator {
  verify(value: AuthenticationEmailSnsVerificationInput): Promise<boolean>;
}

export type AuthenticationEmailSnsVerificationInput = Readonly<{
  version: "1.0.0";
  messageId: string;
  topicArn: string;
  timestamp: string;
  signatureVersion: "1" | "2";
  signature: string;
  signingCertificateUrl: string;
  message: string;
  subject?: string;
}>;

type NormalizedFeedbackEvent = Readonly<{
  version: "1.0.0";
  eventId: string;
  providerMessageReference: string;
  type: AuthenticationEmailFeedbackType;
  occurredAt: Date;
  recipient: string;
  permanent: boolean;
}>;

type ProcessingOutcome = "applied" | "stale" | "unmatched" | "duplicate";

interface DeliveryRow {
  id: string;
  state: string;
}

interface ValidatedKey {
  readonly version: number;
  readonly bytes: Buffer;
}

interface ValidatedConfiguration {
  readonly keys: readonly ValidatedKey[];
  readonly topicArn: string;
  readonly accountId: string;
  readonly identityArn: string;
  readonly sender: string;
  readonly configurationSet: string;
}

export class AuthenticationEmailFeedbackError extends Error {
  constructor() {
    super("Authentication email feedback is unavailable");
    this.name = "AuthenticationEmailFeedbackError";
  }
}

export class AuthenticationEmailFeedbackRepository {
  private readonly configuration: ValidatedConfiguration;

  constructor(
    private readonly pool: Pick<Pool, "connect">,
    configuration: AuthenticationEmailFeedbackConfiguration,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.configuration = validateConfiguration(configuration);
    validDate(clock());
  }

  async isSuppressed(recipientValue: unknown): Promise<boolean> {
    const recipient = normalizedEmail(recipientValue);
    const digests = this.configuration.keys.map((key) =>
      digest(key, RECIPIENT_DOMAIN, [recipient]),
    );
    return this.transaction(async (client) => {
      const selected = await client.query(
        `select 1 from authentication_email_suppression
         where recipient_digest = any($1::text[]) limit 1`,
        [digests],
      );
      return selected.rowCount === 1;
    });
  }

  async process(event: NormalizedFeedbackEvent): Promise<ProcessingOutcome> {
    const receivedAt = validDate(this.clock());
    const eventDigests = this.configuration.keys.map((key) =>
      digest(key, EVENT_DOMAIN, [this.configuration.topicArn, event.eventId]),
    );
    const recipientDigests = this.configuration.keys.map((key) =>
      digest(key, RECIPIENT_DOMAIN, [event.recipient]),
    );
    return this.transaction(async (client) => {
      for (const value of [...eventDigests].sort()) {
        await client.query(
          "select pg_advisory_xact_lock(hashtextextended($1, 0))",
          [value],
        );
      }
      const existing = await client.query(
        `select 1 from authentication_email_feedback_receipt
         where event_digest = any($1::text[]) limit 1`,
        [eventDigests],
      );
      if (existing.rowCount === 1) return "duplicate";

      const selected = await client.query<DeliveryRow>(
        `select id, state from authentication_email_delivery
         where provider_message_reference = $1 for update`,
        [event.providerMessageReference],
      );
      const delivery = selected.rows[0];
      let outcome: Exclude<ProcessingOutcome, "duplicate"> = "unmatched";
      if (delivery) {
        if (event.permanent || event.type === "complaint") {
          for (const value of [...recipientDigests].sort()) {
            await client.query(
              "select pg_advisory_xact_lock(hashtextextended($1, 0))",
              [value],
            );
          }
          const suppressed = await client.query(
            `select 1 from authentication_email_suppression
             where recipient_digest = any($1::text[]) limit 1`,
            [recipientDigests],
          );
          if (suppressed.rowCount !== 1) {
            const key = this.configuration.keys[0]!;
            await client.query(
              `insert into authentication_email_suppression
                 (recipient_key_version, recipient_digest, reason, suppressed_at)
               values ($1, $2, $3, $4)`,
              [
                key.version,
                digest(key, RECIPIENT_DOMAIN, [event.recipient]),
                event.type === "complaint" ? "complaint" : "permanent-bounce",
                receivedAt,
              ],
            );
          }
        }
        const next = nextDeliveryState(delivery.state, event);
        outcome = next === delivery.state ? "stale" : "applied";
        if (outcome === "applied") {
          await client.query(
            `update authentication_email_delivery
             set state = $2, updated_at = $3 where id = $1`,
            [delivery.id, next, receivedAt],
          );
        }
      }

      const key = this.configuration.keys[0]!;
      await client.query(
        `insert into authentication_email_feedback_receipt
           (delivery_id, event_key_version, event_digest, event_type,
            outcome, occurred_at, received_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          delivery?.id ?? null,
          key.version,
          digest(key, EVENT_DOMAIN, [
            this.configuration.topicArn,
            event.eventId,
          ]),
          event.type,
          outcome,
          event.occurredAt,
          receivedAt,
        ],
      );
      return outcome;
    });
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role app_auth_email_feedback_consumer");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the first error; releasing discards a broken pooled client.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createAuthenticationEmailFeedbackProcessor(input: {
  readonly configuration: AuthenticationEmailFeedbackConfiguration;
  readonly authenticator: AuthenticationEmailFeedbackAuthenticator;
  readonly repository: Pick<AuthenticationEmailFeedbackRepository, "process">;
}): Readonly<{
  process(value: unknown): Promise<AuthenticationEmailFeedbackResult>;
}> {
  const configuration = validateConfiguration(input?.configuration);
  if (
    !record(input) ||
    !record(input.authenticator) ||
    typeof input.authenticator.verify !== "function" ||
    !record(input.repository) ||
    typeof input.repository.process !== "function"
  )
    invalid();
  return Object.freeze({
    async process(value: unknown) {
      let envelope: ReturnType<typeof validateQueueMessage>;
      try {
        envelope = validateQueueMessage(value, configuration);
      } catch {
        return feedbackResult("reconcile");
      }
      try {
        if (!(await input.authenticator.verify(envelope.verification)))
          return feedbackResult("reconcile");
      } catch {
        return feedbackResult("retry");
      }
      let event: NormalizedFeedbackEvent;
      try {
        event = normalizeSesEvent(
          envelope.verification.message,
          envelope.verification.messageId,
          configuration,
        );
      } catch {
        return feedbackResult("reconcile");
      }
      try {
        const outcome = await input.repository.process(event);
        if (outcome === "unmatched") return feedbackResult("reconcile");
        return feedbackResult(
          "acknowledge",
          outcome === "duplicate" ? "duplicate" : "processed",
        );
      } catch {
        return feedbackResult("retry");
      }
    },
  });
}

export function loadAuthenticationEmailFeedbackConfiguration(
  environment: NodeJS.ProcessEnv | Record<string, unknown>,
): Readonly<AuthenticationEmailFeedbackConfiguration> {
  if (!record(environment)) invalid();
  if (
    Object.entries(environment).some(
      ([name, value]) =>
        (name.startsWith("NEXT_PUBLIC_AUTH_EMAIL_FEEDBACK") ||
          name.startsWith("NEXT_PUBLIC_SES_AUTH_EMAIL")) &&
        typeof value === "string" &&
        value.length > 0,
    )
  )
    invalid();
  const raw = environment.AUTH_EMAIL_FEEDBACK_KEYS;
  if (typeof raw !== "string" || raw.length === 0) invalid();
  const keys = raw.split(",").map((entry) => {
    const separator = entry.indexOf(":");
    if (separator <= 0 || separator === entry.length - 1) invalid();
    return {
      version: Number(entry.slice(0, separator)),
      value: entry.slice(separator + 1),
    };
  });
  const validated = validateConfiguration({
    keys,
    topicArn: environment.SES_AUTH_EMAIL_FEEDBACK_TOPIC_ARN,
    identityArn: environment.SES_AUTH_EMAIL_IDENTITY_ARN,
    sender: environment.SES_AUTH_EMAIL_FROM,
    configurationSet: environment.SES_AUTH_EMAIL_CONFIGURATION_SET,
  } as AuthenticationEmailFeedbackConfiguration);
  return Object.freeze({
    keys: Object.freeze(
      validated.keys.map((key) =>
        Object.freeze({
          version: key.version,
          value: key.bytes.toString("base64url"),
        }),
      ),
    ),
    topicArn: validated.topicArn,
    identityArn: validated.identityArn,
    sender: validated.sender,
    configurationSet: validated.configurationSet,
  });
}

function validateQueueMessage(
  value: unknown,
  configuration: ValidatedConfiguration,
) {
  if (!exactRecord(value, ["messageId", "body"])) invalid();
  uuid(value.messageId);
  if (
    typeof value.body !== "string" ||
    Buffer.byteLength(value.body, "utf8") > MAX_QUEUE_BODY_BYTES
  )
    invalid();
  const envelope = parseJson(value.body);
  const allowed = [
    "Type",
    "MessageId",
    "TopicArn",
    "Message",
    "Timestamp",
    "SignatureVersion",
    "Signature",
    "SigningCertURL",
    "UnsubscribeURL",
    "Subject",
  ];
  if (!record(envelope) || !onlyKeys(envelope, allowed)) invalid();
  for (const required of allowed.slice(0, 9))
    if (!(required in envelope)) invalid();
  if (envelope.Type !== "Notification") invalid();
  const messageId = uuid(envelope.MessageId);
  if (envelope.TopicArn !== configuration.topicArn) invalid();
  const timestamp = isoInstant(envelope.Timestamp).toISOString();
  if (envelope.SignatureVersion !== "1" && envelope.SignatureVersion !== "2")
    invalid();
  if (
    typeof envelope.Signature !== "string" ||
    envelope.Signature.length < 40 ||
    envelope.Signature.length > 2048 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.Signature)
  )
    invalid();
  const certificate = regionalSnsUrl(envelope.SigningCertURL, false);
  regionalSnsUrl(envelope.UnsubscribeURL, true, configuration.topicArn);
  if (
    typeof envelope.Message !== "string" ||
    Buffer.byteLength(envelope.Message, "utf8") > MAX_QUEUE_BODY_BYTES
  )
    invalid();
  if (
    envelope.Subject !== undefined &&
    (typeof envelope.Subject !== "string" || envelope.Subject.length > 100)
  )
    invalid();
  const verification = Object.freeze({
    version: "1.0.0" as const,
    messageId,
    topicArn: configuration.topicArn,
    timestamp,
    signatureVersion: envelope.SignatureVersion,
    signature: envelope.Signature,
    signingCertificateUrl: certificate,
    message: envelope.Message,
    ...(envelope.Subject === undefined ? {} : { subject: envelope.Subject }),
  });
  return Object.freeze({ verification });
}

function normalizeSesEvent(
  message: string,
  eventId: string,
  configuration: ValidatedConfiguration,
): NormalizedFeedbackEvent {
  const value = parseJson(message);
  if (
    !record(value) ||
    typeof value.eventType !== "string" ||
    !record(value.mail)
  )
    invalid();
  const type = eventType(value.eventType);
  const detailKey = detailField(type);
  if (!exactRecord(value, ["eventType", "mail", detailKey])) invalid();
  const mail = value.mail;
  if (
    !exactRecord(mail, [
      "timestamp",
      "source",
      "sourceArn",
      "sendingAccountId",
      "messageId",
      "destination",
      "headersTruncated",
      "tags",
    ]) ||
    mail.source !== configuration.sender ||
    mail.sourceArn !== configuration.identityArn ||
    mail.sendingAccountId !== configuration.accountId ||
    mail.headersTruncated !== false ||
    !Array.isArray(mail.destination) ||
    mail.destination.length !== 1
  )
    invalid();
  isoInstant(mail.timestamp);
  const recipient = normalizedEmail(mail.destination[0]);
  const providerMessageReference = providerReference(mail.messageId);
  validateTags(mail.tags, configuration.configurationSet);
  const detail = value[detailKey];
  const normalized = normalizeDetail(type, detail, recipient, mail.timestamp);
  return Object.freeze({
    version: "1.0.0",
    eventId,
    providerMessageReference,
    type,
    occurredAt: normalized.occurredAt,
    recipient,
    permanent: normalized.permanent,
  });
}

function normalizeDetail(
  type: AuthenticationEmailFeedbackType,
  value: unknown,
  recipient: string,
  mailTimestamp: unknown,
): Readonly<{ occurredAt: Date; permanent: boolean }> {
  if (!record(value)) invalid();
  if (type === "delivery") {
    if (
      !exactRecord(value, [
        "timestamp",
        "processingTimeMillis",
        "recipients",
        "smtpResponse",
        "reportingMTA",
        "remoteMtaIp",
      ])
    )
      invalid();
    recipients(value.recipients, recipient);
    if (
      !Number.isSafeInteger(value.processingTimeMillis) ||
      Number(value.processingTimeMillis) < 0 ||
      typeof value.smtpResponse !== "string" ||
      value.smtpResponse.length > 2048 ||
      !hostname(value.reportingMTA) ||
      typeof value.remoteMtaIp !== "string" ||
      isIP(value.remoteMtaIp) === 0
    )
      invalid();
    return Object.freeze({
      occurredAt: isoInstant(value.timestamp),
      permanent: false,
    });
  }
  if (type === "bounce") {
    if (
      !onlyKeys(value, [
        "bounceType",
        "bounceSubType",
        "bouncedRecipients",
        "timestamp",
        "feedbackId",
        "reportingMTA",
      ]) ||
      !hasKeys(value, [
        "bounceType",
        "bounceSubType",
        "bouncedRecipients",
        "timestamp",
        "feedbackId",
      ])
    )
      invalid();
    if (
      !boundedToken(value.bounceType, 40) ||
      !boundedToken(value.bounceSubType, 80) ||
      !boundedToken(value.feedbackId, 200) ||
      !["Permanent", "Transient", "Undetermined"].includes(value.bounceType)
    )
      invalid();
    recipientObjects(value.bouncedRecipients, recipient, [
      "emailAddress",
      "action",
      "status",
      "diagnosticCode",
    ]);
    if (value.reportingMTA !== undefined && !hostname(value.reportingMTA))
      invalid();
    return Object.freeze({
      occurredAt: isoInstant(value.timestamp),
      permanent: value.bounceType === "Permanent",
    });
  }
  if (type === "complaint") {
    if (
      !onlyKeys(value, [
        "complainedRecipients",
        "timestamp",
        "feedbackId",
        "userAgent",
        "complaintFeedbackType",
        "arrivalDate",
        "complaintSubType",
      ]) ||
      !hasKeys(value, ["complainedRecipients", "timestamp", "feedbackId"])
    )
      invalid();
    recipientObjects(value.complainedRecipients, recipient, ["emailAddress"]);
    if (!boundedToken(value.feedbackId, 200)) invalid();
    for (const key of [
      "userAgent",
      "complaintFeedbackType",
      "complaintSubType",
    ])
      if (
        value[key] !== undefined &&
        (typeof value[key] !== "string" || value[key].length > 512)
      )
        invalid();
    if (value.arrivalDate !== undefined) isoInstant(value.arrivalDate);
    return Object.freeze({
      occurredAt: isoInstant(value.timestamp),
      permanent: true,
    });
  }
  if (type === "reject") {
    if (!exactRecord(value, ["reason"]) || value.reason !== "Bad content")
      invalid();
    return Object.freeze({
      occurredAt: isoInstant(mailTimestamp),
      permanent: false,
    });
  }
  if (type === "delay") {
    if (
      !exactRecord(value, [
        "timestamp",
        "delayType",
        "expirationTime",
        "delayedRecipients",
        "reportingMTA",
      ]) ||
      !boundedToken(value.delayType, 80) ||
      ![
        "InternalFailure",
        "General",
        "MailboxFull",
        "SpamDetected",
        "RecipientServerError",
        "IPFailure",
        "TransientCommunicationFailure",
        "BYOIPHostNameLookupUnavailable",
        "Undetermined",
        "SendingDeferral",
      ].includes(value.delayType) ||
      typeof value.reportingMTA !== "string" ||
      value.reportingMTA.length > 255
    )
      invalid();
    isoInstant(value.expirationTime);
    recipientObjects(value.delayedRecipients, recipient, [
      "emailAddress",
      "status",
      "diagnosticCode",
    ]);
    return Object.freeze({
      occurredAt: isoInstant(value.timestamp),
      permanent: false,
    });
  }
  if (
    !exactRecord(value, ["templateName", "errorMessage"]) ||
    typeof value.templateName !== "string" ||
    value.templateName.length > 128 ||
    typeof value.errorMessage !== "string" ||
    value.errorMessage.length > 2048
  )
    invalid();
  return Object.freeze({
    occurredAt: isoInstant(mailTimestamp),
    permanent: false,
  });
}

function nextDeliveryState(
  state: string,
  event: NormalizedFeedbackEvent,
): string {
  if (event.type === "complaint") return "complaint";
  if (event.type === "bounce" && event.permanent)
    return state === "complaint" ? state : "permanent-bounce";
  if (
    [
      "complaint",
      "permanent-bounce",
      "provider-rejected",
      "rendering-failed",
    ].includes(state)
  )
    return state;
  if (event.type === "reject") return "provider-rejected";
  if (event.type === "render-failure") return "rendering-failed";
  if (event.type === "delivery")
    return ["accepted", "delivery-delayed", "transient-bounce"].includes(state)
      ? "delivered"
      : state;
  if (event.type === "bounce")
    return ["accepted", "delivery-delayed"].includes(state)
      ? "transient-bounce"
      : state;
  if (event.type === "delay")
    return state === "accepted" ? "delivery-delayed" : state;
  return state;
}

function validateConfiguration(
  value: AuthenticationEmailFeedbackConfiguration,
): ValidatedConfiguration {
  if (
    !record(value) ||
    !Array.isArray(value.keys) ||
    value.keys.length < 1 ||
    value.keys.length > 8
  )
    invalid();
  let previous = Number.POSITIVE_INFINITY;
  const seen = new Set<string>();
  const keys = value.keys.map((candidate) => {
    if (
      !exactRecord(candidate, ["version", "value"]) ||
      !Number.isSafeInteger(candidate.version) ||
      Number(candidate.version) < 0 ||
      Number(candidate.version) >= previous ||
      typeof candidate.value !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(candidate.value)
    )
      invalid();
    const bytes = Buffer.from(candidate.value, "base64url");
    if (
      bytes.length !== 32 ||
      bytes.toString("base64url") !== candidate.value ||
      seen.has(candidate.value)
    )
      invalid();
    previous = Number(candidate.version);
    seen.add(candidate.value);
    return Object.freeze({ version: Number(candidate.version), bytes });
  });
  if (typeof value.topicArn !== "string") invalid();
  const arn =
    /^arn:aws:sns:ca-central-1:([0-9]{12}):([A-Za-z0-9_-]{1,256})$/.exec(
      value.topicArn,
    );
  if (
    !arn ||
    typeof value.identityArn !== "string" ||
    !new RegExp(
      `^arn:aws:ses:ca-central-1:${arn[1]}:identity/[A-Za-z0-9@._-]{1,254}$`,
    ).test(value.identityArn)
  )
    invalid();
  const sender = normalizedEmail(value.sender);
  if (
    typeof value.configurationSet !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(value.configurationSet)
  )
    invalid();
  return Object.freeze({
    keys: Object.freeze(keys),
    topicArn: value.topicArn,
    accountId: arn[1]!,
    identityArn: value.identityArn,
    sender,
    configurationSet: value.configurationSet,
  });
}

function validateTags(value: unknown, configurationSet: string) {
  if (!record(value) || Object.keys(value).length > 16) invalid();
  for (const [key, entries] of Object.entries(value)) {
    if (
      !/^[A-Za-z0-9:._-]{1,128}$/.test(key) ||
      !Array.isArray(entries) ||
      entries.length < 1 ||
      entries.length > 10 ||
      entries.some((entry) => typeof entry !== "string" || entry.length > 256)
    )
      invalid();
  }
  const selected = value["ses:configuration-set"];
  if (
    !Array.isArray(selected) ||
    selected.length !== 1 ||
    selected[0] !== configurationSet
  )
    invalid();
}

function recipients(value: unknown, expected: string) {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    normalizedEmail(value[0]) !== expected
  )
    invalid();
}

function recipientObjects(
  value: unknown,
  expected: string,
  allowedKeys: readonly string[],
) {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !record(value[0]) ||
    !onlyKeys(value[0], allowedKeys) ||
    !hasKeys(value[0], ["emailAddress"]) ||
    normalizedEmail(value[0].emailAddress) !== expected
  )
    invalid();
  for (const [key, entry] of Object.entries(value[0]))
    if (
      key !== "emailAddress" &&
      (typeof entry !== "string" || entry.length > 2048)
    )
      invalid();
}

function eventType(value: string): AuthenticationEmailFeedbackType {
  const mapping: Record<string, AuthenticationEmailFeedbackType> = {
    Delivery: "delivery",
    Bounce: "bounce",
    Complaint: "complaint",
    Reject: "reject",
    DeliveryDelay: "delay",
    "Rendering Failure": "render-failure",
  };
  const mapped = mapping[value];
  if (!mapped) invalid();
  return mapped;
}

function detailField(type: AuthenticationEmailFeedbackType) {
  return (
    {
      delivery: "delivery",
      bounce: "bounce",
      complaint: "complaint",
      reject: "reject",
      delay: "deliveryDelay",
      "render-failure": "failure",
    } as const
  )[type];
}

function feedbackResult(
  disposition: AuthenticationEmailFeedbackResult["disposition"],
  acknowledged?: "processed" | "duplicate",
): AuthenticationEmailFeedbackResult {
  const code =
    disposition === "retry"
      ? "FEEDBACK_RETRY"
      : disposition === "reconcile"
        ? "FEEDBACK_RECONCILIATION_REQUIRED"
        : acknowledged === "duplicate"
          ? "FEEDBACK_DUPLICATE"
          : "FEEDBACK_PROCESSED";
  return Object.freeze({ version: "1.0.0", disposition, code });
}

function digest(key: ValidatedKey, domain: string, parts: readonly string[]) {
  const hmac = createHmac("sha256", key.bytes).update(domain);
  for (const part of parts) hmac.update("\0").update(part);
  return `hmac-sha256:${key.version}:${hmac.digest("hex")}`;
}

function normalizedEmail(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    value !== value.toLowerCase() ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      value,
    ) ||
    value.includes("..")
  )
    invalid();
  return value;
}

function providerReference(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  )
    invalid();
  return value;
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    invalid();
  return value;
}

function regionalSnsUrl(
  value: unknown,
  unsubscribe: boolean,
  topicArn?: string,
): string {
  if (typeof value !== "string" || value.length > 2048) invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "sns.ca-central-1.amazonaws.com" ||
    url.username ||
    url.password ||
    url.hash
  )
    invalid();
  if (unsubscribe) {
    const subscriptionArn = url.searchParams.get("SubscriptionArn");
    if (
      url.pathname !== "/" ||
      url.searchParams.get("Action") !== "Unsubscribe" ||
      url.searchParams.size !== 2 ||
      typeof topicArn !== "string" ||
      typeof subscriptionArn !== "string" ||
      !new RegExp(
        `^${escapeRegex(topicArn)}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
      ).test(subscriptionArn)
    )
      invalid();
  } else if (
    !/^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(url.pathname) ||
    url.search
  )
    invalid();
  return url.toString();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isoInstant(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) invalid();
  return parsed;
}

function validDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value.getTime());
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    invalid();
  }
}

function hostname(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 255 &&
    /^[A-Za-z0-9.-]+$/.test(value)
  );
}

function boundedToken(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasKeys(value: Record<string, unknown>, required: readonly string[]) {
  return required.every((key) => key in value);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    hasKeys(value, keys)
  );
}

function invalid(): never {
  throw new AuthenticationEmailFeedbackError();
}
