# ADR 0014: Package the authentication-email feedback worker on ECS

- Status: Accepted
- Date: 2026-08-25

## Context

ADR 0013 defines an authenticated, idempotent SQS consumer, but it does not define its production
process, artifact, ECS service, scaling, or credential boundary. Authentication-email suppression is
time-sensitive: an unavailable consumer can allow a later authentication email to be sent before a
new complaint or permanent bounce has reached the local suppression ledger. The worker therefore
needs an independently promotable artifact and a continuously available, bounded service without
sharing the web task's image, role, listener, secrets, or connection budget.

The baseline remains credential-free. It must be possible to validate the complete source, container,
task definition, IAM policy, and mocked scaling plan without an AWS account, image push, queue poll, or
resource mutation.

## Decision

- Build a separate `Dockerfile.worker` artifact. Bundle only the Node entry point and its runtime
  dependencies, then copy `worker.mjs` and a read-only PID-1 health probe into the pinned Distroless
  no-OpenSSL runtime. Run as `nonroot`, expose no port, provide no shell or package manager, require a
  read-only root filesystem, and use an exec-form command so Node receives signals directly.
- The production bootstrap validates all configuration before creating the SQS client or database
  pool. It requires the exact Canada Central queue/topic/identity contract, a TLS PostgreSQL URL using
  `sslmode=verify-full` outside an explicit local-only mode, a four-connection pool, and ECS task-role
  credentials. Static AWS keys, profiles, shared credential files, alternate endpoints, web identity,
  role override, and full-URI credential injection fail startup.
  Production also disables EC2 instance metadata and requires the ECS-injected relative task-credential
  path, preventing fallback to host credentials while preserving automatic short-lived task credentials.
- On `SIGTERM` or `SIGINT`, abort the long poll and stop accepting a returned batch after cancellation.
  Allow already-started work and visibility heartbeats to complete, close the database pool, and use a
  90-second ECS `stopTimeout`. The 60-second message visibility period remains replay-safe if Fargate
  ultimately kills the process.
- Deploy a distinct private Fargate service and immutable feedback-worker ECR repository. The task has
  0.5 vCPU, 1 GiB memory, no port mappings, no load balancer, no public IP, no inbound security-group
  rule, and only TCP 443 through NAT plus PostgreSQL 5432 to the database security group.
- Keep the task role separate from the execution role. The task role can only receive, delete, change
  visibility, and read attributes on the exact source queue. The execution role can pull/log through
  the standard ECS execution policy and read only the two named worker secrets, with decrypt limited to
  their exact KMS keys through regional Secrets Manager. Secret rotation requires a new task launch or
  forced service deployment; injected environment secrets do not update in a running task.
- Do not scale to zero. Staging keeps at least one task and production at least two, with a maximum of
  four. Target tracking uses `ApproximateNumberOfMessagesVisible / RunningTaskCount`, target 10,
  60-second scale-out, and 300-second scale-in cooldowns. Scale-to-zero would require a published metric
  datapoint before capacity returns and is incompatible with timely suppression processing. Alarm when
  running tasks fall below the environment minimum, source age exceeds 300 seconds, or any DLQ message
  is visible.
- Reserve four PostgreSQL connections per maximum worker task. The planning assertion is
  `application max * 32 + worker max * 4 + operator/migration reserve <= database max`. The current
  default maximums (2 application, 4 worker, 20 reserve) consume exactly the 100-connection baseline.
- Treat backlog target and cooldowns as provisional operating values. Re-evaluate them from measured
  message arrival/service time and the suppression freshness SLO before production. Include worker
  Fargate hours, ECR storage/scanning, SQS requests, NAT traffic, log ingestion, metrics, alarms,
  Secrets Manager calls, and KMS calls in the approved calculator estimate.

## Consequences

Application and worker releases can be promoted or rolled back independently, and compromising one
task role does not grant the other workload's permissions. The health probe proves only that the
expected Node worker is PID 1; queue age, running-task count, aggregate failures, and database signals
provide operational readiness. A healthy process with broken downstream access remains unhealthy at
the service level and must alarm rather than expose an inbound health endpoint.

Keeping at least one idle task costs more than scale-to-zero, and production deliberately pays for two
tasks. This is accepted for suppression freshness and deployment availability. No live scaling
behavior, task credentials, secret rotation, RDS failover, NAT/certificate access, or CloudWatch alarm
delivery is proven by the local baseline; all remain staging acceptance gates.

## Sources

- [Amazon ECS task IAM roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)
- [Amazon ECS task execution role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html)
- [Amazon ECS secret injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html)
- [AWS SDK container credentials](https://docs.aws.amazon.com/sdkref/latest/guide/feature-container-credentials.html)
- [Amazon ECS deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html)
- [Amazon ECS service auto scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html)
- [Backlog-per-task target tracking](https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-target-tracking-metric-math.html)
- [Amazon ECS Container Insights metrics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-metrics-ECS.html)
- [Amazon ECS container stop timeout](https://docs.aws.amazon.com/sdk-for-swift/latest/api/awsecs/documentation/awsecs/ecsclienttypes/containerdefinition/stoptimeout/)
- [Amazon SQS pricing](https://aws.amazon.com/sqs/pricing/)
