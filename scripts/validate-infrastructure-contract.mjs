import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const infrastructureRoot = fileURLToPath(
  new URL("../infra/aws/", import.meta.url),
);

const files = walk(infrastructureRoot)
  .filter((path) => extname(path) === ".tf")
  .filter((path) => !path.includes("policy-fixtures"));
const source = files.map((path) => readFileSync(path, "utf8")).join("\n");
const computeSource = readFileSync(
  new URL("../infra/aws/modules/compute/main.tf", import.meta.url),
  "utf8",
);

const forbidden = [
  [/publicly_accessible\s*=\s*true/u, "public data store"],
  [/assign_public_ip\s*=\s*true/u, "public application task"],
  [/resources\s*=\s*\[\s*"\*"\s*\]/u, "wildcard IAM resource"],
  [/ip_protocol\s*=\s*"-1"/u, "unrestricted security-group protocol"],
  [/skip_final_snapshot\s*=\s*true/u, "missing final database snapshot"],
  [/"SEND"/u, "unsupported SES send feedback"],
  [/feedback_worker_desired_count\s*=\s*0/u, "feedback worker scale to zero"],
];

for (const [pattern, description] of forbidden) {
  assert.equal(pattern.test(source), false, `rejected ${description}`);
  assert.equal(
    pattern.test(unsafeFixture(description)),
    true,
    `self-test detects ${description}`,
  );
}

for (const [pattern, description] of [
  [/storage_encrypted\s*=\s*true/u, "database encryption"],
  [/deletion_protection\s*=\s*true/u, "database deletion protection"],
  [/prevent_destroy\s*=\s*true/u, "database lifecycle guard"],
  [/image_tag_mutability\s*=\s*"IMMUTABLE"/u, "immutable container tags"],
  [/readonlyRootFilesystem\s*=\s*true/u, "read-only task filesystem"],
  [
    /PUBLIC_SITE_INDEXING_ENABLED",\s*value\s*=\s*"false/u,
    "indexing-disabled default",
  ],
  [/use_lockfile\s*=\s*true/u, "native S3 lockfile"],
  [/enforced\s*=\s*true/u, "state and plan encryption"],
  [/signature_version\s*=\s*2/u, "SNS SHA-256 signature version"],
  [/"RENDERING_FAILURE"/u, "SES rendering-failure feedback"],
  [/visibility_timeout_seconds\s*=\s*60/u, "feedback visibility timeout"],
  [/maxReceiveCount\s*=\s*5/u, "bounded feedback redrive threshold"],
  [/redrivePermission\s*=\s*"byQueue"/u, "exact DLQ redrive permission"],
  [
    /sourceQueueArns\s*=\s*\[aws_sqs_queue\.feedback\.arn\]/u,
    "exact DLQ source queue",
  ],
  [
    /resource\s+"aws_ecs_service"\s+"feedback_worker"/u,
    "feedback worker ECS service",
  ],
  [/portMappings\s*=\s*\[\]/u, "headless feedback worker"],
  [/stopTimeout\s*=\s*90/u, "feedback worker graceful stop timeout"],
  [
    /AWS_EC2_METADATA_DISABLED",\s*value\s*=\s*"true"/u,
    "EC2 metadata disabled for feedback worker",
  ],
  [/RELEASE_SOURCE_REVISION/u, "shared release source revision"],
  [/RELEASE_SET_SHA256/u, "dual-artifact release-set identity"],
  [/expression\s*=\s*"queue \/ tasks"/u, "feedback backlog-per-task scaling"],
  [/feedback_worker_max_count[\s\S]*?<= 4/u, "bounded feedback worker scaling"],
  [/"sqs:ReceiveMessage"/u, "feedback queue receive permission"],
  [/"sqs:DeleteMessage"/u, "feedback queue delete permission"],
  [/"sqs:ChangeMessageVisibility"/u, "feedback visibility permission"],
  [
    /resources\s*=\s*\[var\.feedback_queue_arn\]/u,
    "exact feedback queue IAM resource",
  ],
  [/AUTH_EMAIL_FEEDBACK_DATABASE_URL/u, "feedback database secret injection"],
  [/AUTH_EMAIL_FEEDBACK_KEYS/u, "feedback HMAC secret injection"],
]) {
  assert.match(source, pattern, `missing ${description}`);
}

const workerTaskPolicy = computeSource.slice(
  computeSource.indexOf(
    'data "aws_iam_policy_document" "feedback_worker_queue"',
  ),
  computeSource.indexOf(
    'resource "aws_iam_role_policy" "feedback_worker_queue"',
  ),
);
assert.ok(
  workerTaskPolicy.length > 0,
  "feedback worker task policy is missing",
);
assert.deepEqual(
  [...workerTaskPolicy.matchAll(/"(sqs:[A-Za-z]+)"/gu)].map(
    (match) => match[1],
  ),
  [
    "sqs:ReceiveMessage",
    "sqs:DeleteMessage",
    "sqs:ChangeMessageVisibility",
    "sqs:GetQueueAttributes",
  ],
  "feedback worker task role must deny every unlisted SQS action",
);
assert.match(
  workerTaskPolicy,
  /resources\s*=\s*\[var\.feedback_queue_arn\]/u,
  "feedback worker task role must target only the exact source queue",
);

const ciRoot = fileURLToPath(new URL("../.github/", import.meta.url));
const ciSource = walk(ciRoot)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
assert.doesNotMatch(
  ciSource,
  /AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)\s*:/u,
  "static AWS CI key is forbidden",
);

const variables = readFileSync(
  new URL("../infra/aws/variables.tf", import.meta.url),
  "utf8",
);
assert.match(
  variables,
  /app_max_count[\s\S]*?<= 10/u,
  "autoscaling maximum must remain bounded",
);
assert.match(
  variables,
  /log_retention_days[\s\S]*?contains\(\[30, 60, 90, 120, 150, 180, 365\]/u,
  "log retention must remain bounded",
);
assert.match(
  variables,
  /backup_retention_days[\s\S]*?>= 7[\s\S]*?<= 35/u,
  "backup retention must remain bounded",
);
assert.match(
  variables,
  /aws_region == "ca-central-1"/u,
  "Canada Central must remain enforced",
);
assert.match(
  variables,
  /aws_account_id[\s\S]*?\^\[0-9\]\{12\}\$/u,
  "account ID must remain explicit",
);

console.log(`infrastructure contract valid (${files.length} Terraform files)`);

function walk(root) {
  const entries = readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function unsafeFixture(description) {
  return {
    "public data store": "publicly_accessible = true",
    "public application task": "assign_public_ip = true",
    "wildcard IAM resource": 'resources = ["*"]',
    "unrestricted security-group protocol": 'ip_protocol = "-1"',
    "missing final database snapshot": "skip_final_snapshot = true",
    "unsupported SES send feedback": 'matching_event_types = ["SEND"]',
    "feedback worker scale to zero": "feedback_worker_desired_count = 0",
  }[description];
}
