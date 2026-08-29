import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { canonicalJson } from "./lib/artifact-manifest.mjs";
import {
  createCiReleaseEvidence,
  validateCiReleaseEvidence,
} from "./lib/ci-release-evidence.mjs";

const root = process.cwd();
const policy = JSON.parse(
  readFileSync(join(root, "config", "release-ci-policy.json"), "utf8"),
);
const workflowText = readFileSync(join(root, policy.workflow.path), "utf8");
const configuredDirectory = requireEnvironment(
  "RELEASE_EVIDENCE_EXPORT_DIRECTORY",
);
const evidenceDirectory = resolve(configuredDirectory);
assert.ok(isAbsolute(evidenceDirectory));
const relativeEvidence = relative(root, evidenceDirectory).replaceAll(
  "\\",
  "/",
);
assert.ok(
  relativeEvidence === "release-evidence",
  "CI release evidence must use the workspace release-evidence directory",
);
const evidenceFiles = Object.fromEntries(
  policy.requiredEvidenceFiles.map((name) => [
    name,
    readFileSync(join(evidenceDirectory, name)),
  ]),
);
const releaseSet = JSON.parse(
  evidenceFiles["release-set.json"].toString("utf8"),
);
const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/u, ".000Z");
const context = {
  repository: requireEnvironment("GITHUB_REPOSITORY"),
  repositoryId: requireEnvironment("GITHUB_REPOSITORY_ID"),
  repositoryOwnerId: requireEnvironment("GITHUB_REPOSITORY_OWNER_ID"),
  commit: requireEnvironment("GITHUB_SHA"),
  ref: requireEnvironment("GITHUB_REF"),
  event: requireEnvironment("GITHUB_EVENT_NAME"),
  workflowRef: requireEnvironment("GITHUB_WORKFLOW_REF"),
  workflowSha: requireEnvironment("GITHUB_WORKFLOW_SHA"),
  job: requireEnvironment("GITHUB_JOB"),
  runId: requireEnvironment("GITHUB_RUN_ID"),
  runAttempt: requireEnvironment("GITHUB_RUN_ATTEMPT"),
  runNumber: requireEnvironment("GITHUB_RUN_NUMBER"),
  actorId: requireEnvironment("GITHUB_ACTOR_ID"),
  runnerEnvironment: requireEnvironment("RUNNER_ENVIRONMENT"),
  runnerLabel: requireEnvironment("CI_RUNNER_LABEL"),
  runnerOs: requireEnvironment("RUNNER_OS"),
  runnerArch: requireEnvironment("RUNNER_ARCH"),
  runnerImageOs: requireEnvironment("ImageOS"),
  runnerImageVersion: requireEnvironment("ImageVersion"),
  tools: {
    node: process.version,
    npm: capture("npm", ["--version"]),
    docker: capture("docker", ["--version"]),
  },
};
const envelope = createCiReleaseEvidence({
  context,
  policy,
  workflowText,
  evidenceFiles,
  releaseSet,
  createdAt,
});
validateCiReleaseEvidence({
  envelope,
  policy,
  workflowText,
  evidenceFiles,
  releaseSet,
  now: createdAt,
});
writeFileSync(
  join(evidenceDirectory, "ci-release-evidence.json"),
  canonicalJson(envelope),
  { flag: "wx" },
);
console.log(
  `CI release evidence bound ${envelope.artifacts.length} files for run ${envelope.identity.runKey}`,
);

function requireEnvironment(name) {
  const value = process.env[name];
  assert.ok(value, `missing environment variable: ${name}`);
  return value;
}

function capture(command, arguments_) {
  return execFileSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}
