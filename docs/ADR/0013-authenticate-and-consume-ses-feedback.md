# ADR 0013: Authenticate and consume Amazon SES feedback through SNS and SQS

- Status: Accepted
- Date: 2026-08-24

## Context

Authentication email already has a provider-neutral dispatch boundary, a service-only delivery
ledger, and privacy-minimized feedback and suppression tables. The missing boundary was a deployable
queue consumer. Amazon SES publishes configuration-set events to SNS; SNS delivers an at-least-once
notification envelope to SQS. A consumer therefore has to authenticate the SNS envelope, tolerate
duplicates and reordering, and acknowledge a queue item only after the existing database transaction
has committed.

The worker must remain testable without credentials or AWS access. It must not turn provider payloads,
recipient addresses, signatures, receipt handles, or provider message identifiers into logs or durable
application data.

## Decision

- Accept only the versioned regional contract: SES configuration set, SNS topic, and SQS queues are in
  `ca-central-1`; the topic uses SNS signature version 2; the envelope identifies the exact topic,
  sender identity, configuration set, and supported SES event type.
- Verify the SNS version-2 RSA-SHA256 signature over the documented canonical field order. Fetch the
  signing certificate only from the exact HTTPS `sns.ca-central-1.amazonaws.com` certificate path,
  refuse redirects and oversized responses, rely on Node's trusted HTTPS chain for transport, and
  additionally require the SNS DNS identity, validity interval, and an RSA key of at least 2048 bits.
  A future-dated message beyond five minutes is invalid. There is deliberately no past-age cutoff:
  approved DLQ replay can be old and remains safe through durable idempotency.
- Treat certificate retrieval or other transient verifier failure as retryable. Treat a completed
  negative authentication result as reconciliation-required. Never process an unauthenticated event.
- Receive at most 10 SQS messages and process at most four concurrently. Use 20-second long polling,
  a 60-second visibility timeout, and a 20-second visibility heartbeat. The concurrency ceiling matches
  the existing four-connection feedback database pool budget.
- Pass validated queue bodies into the existing feedback processor. Its single transaction writes a
  keyed, content-free SNS receipt, applies safe delivery-state transitions, and adds keyed suppression
  for complaints and permanent bounces. Duplicate or stale outcomes are safe acknowledgements; an
  unmatched or invalid authenticated event is retained for reconciliation.
- Delete an SQS message individually only after the processor returns durable `acknowledge`. Processing,
  database, verifier, visibility, and delete failures remain retryable. The infrastructure redrives
  after five receives to a 14-day DLQ; only the exact source queue may redrive to it.
- Export only aggregate cycle counts and oldest-message age. Raw queue bodies, addresses, IDs,
  signatures, certificate URLs, receipt handles, and provider diagnostics are prohibited telemetry.
- Keep queue transport, certificate authority, clock, sleep, and message processor injected. The local
  queue double and local entrypoint prove behavior without credentials. Live resource creation,
  polling, redrive, sender verification, or delivery still requires separate staging approval.

## Security and failure consequences

The design assumes standard-queue at-least-once delivery and makes the database receipt authoritative,
not receipt order or SQS delivery count. A worker crash after commit but before delete replays safely.
A visibility extension failure does not acknowledge early; it can cause concurrent delivery, which is
serialized and deduplicated by the existing transaction. Unsupported or malformed input cannot mutate
delivery or suppression state. Reconciliation and DLQ operators remain separate from the runtime role.

Transport-authenticated certificate retrieval is intentionally narrow to the fixed AWS regional host.
If AWS changes the signing host, certificate format, signature version, or canonicalization, the worker
fails closed until this ADR, fixtures, and implementation are reviewed.

## Sources

- [Amazon SNS message signature verification](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html)
- [Amazon SNS canonical signature fields](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-verify-message-signature.html)
- [Amazon SNS signature version 2](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-configure-message-signature.html)
- [Amazon SQS ReceiveMessage](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html)
- [Amazon SQS at-least-once delivery](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html)
- [Amazon SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [Amazon SQS DLQ redrive](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-dead-letter-queue-redrive.html)
- [Amazon SES event contents](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-firehose-contents.html)
- [Amazon SES event publishing](https://docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html)
- [Amazon SES account suppression list](https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html)
