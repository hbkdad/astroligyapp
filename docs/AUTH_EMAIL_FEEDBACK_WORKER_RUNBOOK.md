# Authentication-email feedback worker runbook

Contract version: 1.1.0

This is a deployment and incident contract, not authorization to contact AWS. No queue, credential,
sender identity, DNS record, secret, database, task, redrive, or live email may be created or changed
without the staging approval in `docs/STAGING_IMPLEMENTATION_CHECKLIST.md`.

## Runtime contract

Run the worker in `ca-central-1` against the exact configured feedback queue and topic. Use the
service-only feedback database login and the existing feedback HMAC key ring. Recommended defaults are
10 messages per receive, concurrency 4, 20-second long polling, 60-second visibility, a 20-second
heartbeat, four-day source retention, five receives before redrive, and 14-day DLQ retention.

Run the independently promoted `-feedback-worker@sha256:` image in its private Fargate service. The
task is 0.5 vCPU/1 GiB, has no port/load balancer/public IP/inbound rule, runs read-only as `nonroot`,
and receives only HTTPS egress through NAT plus PostgreSQL traffic to the database security group.
Keep one task minimum in staging, two in production, and four maximum. Scale-to-zero is rejected because
suppression freshness cannot wait for capacity to return after a new metric datapoint.

The worker deletes only a durably acknowledged message. Retry, reconciliation, invalid batch input,
visibility failure, and delete failure stay on the source queue and eventually redrive. Standard SQS is
at least once: duplicates and a crash between database commit and delete are normal and are resolved by
the signed SNS message-ID HMAC receipt. Provider order is not authoritative; a complaint or permanent
bounce cannot be undone by a later delivery event.

For a credential-free smoke test:

```text
npm run worker:feedback:local
npm run build:feedback-worker
```

The command must report only versioned aggregate counts. It must not print the queue body, SNS message
ID, receipt handle, signature, certificate URL, recipient, provider message ID, diagnostic text, IP,
account ID, or HMAC.

## Least-privilege identities

The worker task role is limited to `sqs:ReceiveMessage`, `sqs:DeleteMessage`,
`sqs:ChangeMessageVisibility`, and `sqs:GetQueueAttributes` on the exact source queue. It receives only
the exact feedback database-secret ARN and its exact KMS decrypt permission. It has no SQS send, purge,
redrive, DLQ receive, SES send/configuration, SNS publish/subscribe, migration, or broad secret access.

The database login assumes only `astroligy_auth_email_feedback_consumer` through the existing
transaction wrapper. It cannot read raw auth users, migrate schema, or use the application-owner role.
An operator who inspects counts and initiates an approved DLQ redrive uses a separate, time-bounded
role. Do not grant redrive or DLQ payload access to the steady-state worker.

The ECS execution role, not the task role, pulls the image and emits logs. It may read only
`AUTH_EMAIL_FEEDBACK_DATABASE_URL` and `AUTH_EMAIL_FEEDBACK_KEYS` and decrypt their exact customer KMS
keys through `secretsmanager.ca-central-1.amazonaws.com`. A running task does not receive rotated
injected secrets: register/reuse the reviewed task definition and force a deployment after rotation.
Never place a value in Terraform, task environment, image, plan evidence, or routine logs.

## Startup and shutdown

Before startup, validate the exact regional queue URL, topic ARN, sender identity, configuration-set
name, feedback HMAC key versions, TLS database URL, and pool limit. Configuration errors stop startup;
never fall back to another region, topic, identity, queue, key, or database role.

On `SIGTERM`, abort the active long poll and start no newly returned batch after cancellation. Allow
already-started work and visibility heartbeats to finish within the 90-second task stop timeout, then
close the four-connection database pool. Keep the stop grace above the 60-second visibility period.
If the process is killed, the visibility timeout expires and the item is retried idempotently. Do not
purge the source queue or DLQ during deployment or rollback.

## Signals and alarms

Publish only aggregate cycle disposition/counts, worker availability, database latency/error class,
and SQS service metrics. The checked-in baseline alarms when source `ApproximateAgeOfOldestMessage`
exceeds 300 seconds for two periods and when the DLQ has any visible message. Also page on sustained
worker absence, repeated receive failures, delete failures, visibility failures, database pool
saturation, or a material suppression-rate increase. Alarm destinations and owners require staging
approval and must not be stored as plaintext Terraform values.

Target tracking uses visible source-queue backlog divided by the service's Container Insights
`RunningTaskCount`: target 10, 60-second scale-out, and 300-second scale-in cooldowns. These are bounded
planning values, not a proven SLO. Alarm when running tasks are below the environment minimum with
missing data treated as breaching. Validate the division metric and alarm delivery in staging before
email is enabled.

Application logs use fixed event names and error classes only. Disable debug SDK wire logging. Logging
or exporting bodies, identifiers, addresses, signatures, receipt handles, certificate URLs, delivery
diagnostics, or suppression HMACs is a stop condition and privacy incident.

## Failure handling

| Condition                     | Action                                                                          | Safe evidence                          |
| ----------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| Certificate fetch unavailable | Leave message for retry; verify DNS/TLS/egress and regional host                | retry count and fixed error class      |
| Signature or envelope invalid | Do not mutate state; retain for reconciliation/redrive                          | reconciliation count and DLQ count     |
| Database or role failure      | Roll back; leave message; verify pool, TLS, role, and transaction logs          | database error class and rollback test |
| Visibility or delete failure  | Leave message; expect duplicate; verify SQS service/role                        | aggregate failure count                |
| Source age over 300 seconds   | Page owner; pause sending if backlog threatens suppression freshness            | age, depth, worker count               |
| DLQ message visible           | Stop automatic assumptions; preserve it; open a bounded reconciliation incident | DLQ count and receive count            |
| Suppression anomaly           | Pause authentication-email dispatch; preserve suppression ledger                | aggregate event/outcome counts         |

## DLQ reconciliation and replay

1. Name the incident, operator, exact environment, queue ARNs, affected time window, and approval.
2. Stop or reduce new authentication-email dispatch if stale suppression could cause further sends.
3. Inspect aggregate queue attributes first. Do not paste or export message bodies into tickets or chat.
4. Fix and deploy the reviewed parser, certificate, database, or configuration issue; run focused,
   database, security, and release checks against synthetic fixtures.
5. Use SQS redrive to the exact source queue with a bounded velocity. Never redrive to another queue,
   edit payloads, reset durable receipts, or purge either queue.
6. Watch source age, DLQ count, retry/reconciliation counts, database saturation, and suppression
   outcomes. Stop redrive on repeated failure or unexpected growth.
7. Close only when the source is healthy, the DLQ is empty or every retained item has an explicit
   disposition, and privacy-safe evidence records the exact change and reviewer.

Old signed notifications are allowed during approved replay; the durable receipt prevents duplicate
mutation. Future timestamps beyond five minutes fail authentication. Retention expiry is irreversible,
so a DLQ alert must have a named 24/7 owner before email is enabled.

## Staging acceptance

After explicit approval, test with synthetic addresses in an isolated non-production AWS account:
valid delivery, duplicate delivery, complaint, permanent and transient bounce, reject, delay, rendering
failure, malformed signature, certificate outage, database rollback, concurrent replay, out-of-order
delivery, visibility expiry, five-receive redrive, bounded DLQ replay, shutdown during processing, and
alarm delivery. Confirm CloudWatch/application evidence contains none of the prohibited data. Production
remains NO-GO until this matrix, account suppression behavior, IAM simulation, owners, costs, and rollback
are reviewed.

Before approval, run `npm run test:feedback-worker-artifact`, `npm run test:infrastructure`, and the
exact-commit release gate. In staging, additionally prove IAM allow/deny simulation, task replacement
after secret rotation, no inbound/listener, certificate and PostgreSQL TLS identity, target tracking in
both directions without exceeding four tasks, circuit-breaker rollback, and termination/replay within
the visibility contract.
