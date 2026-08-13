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

const forbidden = [
  [/publicly_accessible\s*=\s*true/u, "public data store"],
  [/assign_public_ip\s*=\s*true/u, "public application task"],
  [/resources\s*=\s*\[\s*"\*"\s*\]/u, "wildcard IAM resource"],
  [/ip_protocol\s*=\s*"-1"/u, "unrestricted security-group protocol"],
  [/skip_final_snapshot\s*=\s*true/u, "missing final database snapshot"],
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
]) {
  assert.match(source, pattern, `missing ${description}`);
}

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
  }[description];
}
