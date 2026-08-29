import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canonicalJson } from "./lib/artifact-manifest.mjs";
import {
  createCiReleaseEvidence,
  validateCiReleaseEvidence,
  validateWorkflowContract,
} from "./lib/ci-release-evidence.mjs";

const policy = JSON.parse(
  readFileSync("config/release-ci-policy.json", "utf8"),
);
const workflowText = readFileSync(policy.workflow.path, "utf8");
const commit = "a".repeat(40);
const releaseSet = syntheticReleaseSet(commit);
const evidenceFiles = Object.fromEntries(
  policy.requiredEvidenceFiles.map((name) => [
    name,
    Buffer.from(
      name === "release-set.json"
        ? canonicalJson(releaseSet)
        : `synthetic CI fixture: ${name}\n`,
    ),
  ]),
);
const context = {
  repository: policy.repository,
  repositoryId: policy.repositoryId,
  repositoryOwnerId: policy.repositoryOwnerId,
  commit,
  ref: policy.workflow.ref,
  event: "push",
  workflowRef: `${policy.repository}/${policy.workflow.path}@${policy.workflow.ref}`,
  workflowSha: commit,
  job: policy.workflow.job,
  runId: "1000001",
  runAttempt: "1",
  runNumber: "88",
  actorId: "10001",
  runnerEnvironment: "github-hosted",
  runnerLabel: policy.workflow.runnerLabel,
  runnerOs: "Linux",
  runnerArch: "X64",
  runnerImageOs: "ubuntu24",
  runnerImageVersion: "20260825.1.0",
  tools: {
    node: policy.toolVersions.node,
    npm: policy.toolVersions.npm,
    docker: "Docker version 28.3.3, build 980b856",
  },
};
const createdAt = "2026-08-29T05:00:00.000Z";
const input = {
  context,
  policy,
  workflowText,
  evidenceFiles,
  releaseSet,
  createdAt,
};
const envelope = createCiReleaseEvidence(input);
assert.doesNotThrow(() =>
  validateCiReleaseEvidence({
    envelope,
    policy,
    workflowText,
    evidenceFiles,
    releaseSet,
    now: createdAt,
  }),
);
assert.equal(envelope.approval.promotionAuthorized, false);
assert.equal(envelope.artifacts.length, 15);
assert.equal(envelope.identity.commit, releaseSet.statement.source.commit);

for (const mutate of [
  (copy) => (copy.envelope.identity.event = "pull_request"),
  (copy) => (copy.envelope.identity.repositoryId = "999999"),
  (copy) => (copy.envelope.identity.ref = "refs/heads/feature"),
  (copy) => (copy.envelope.identity.workflowSha = "b".repeat(40)),
  (copy) => (copy.envelope.identity.runAttempt = "2"),
  (copy) => (copy.envelope.runner.environment = "self-hosted"),
  (copy) => (copy.envelope.permissions.contents = "write"),
  (copy) => (copy.envelope.permissions.idToken = "write"),
  (copy) => (copy.envelope.approval.state = "approved"),
  (copy) => (copy.envelope.approval.promotionAuthorized = true),
  (copy) => copy.envelope.artifacts.pop(),
  (copy) => (copy.envelope.artifacts[0].sha256 = `sha256:${"f".repeat(64)}`),
  (copy) =>
    copy.evidenceFiles[policy.requiredEvidenceFiles[0]].write("tampered"),
  (copy) => delete copy.evidenceFiles[policy.requiredEvidenceFiles[0]],
  (copy) => (copy.releaseSet.statement.source.commit = "b".repeat(40)),
  (copy) => (copy.now = envelope.expiresAt),
]) {
  const copy = {
    envelope: structuredClone(envelope),
    policy: structuredClone(policy),
    workflowText,
    evidenceFiles: cloneBuffers(evidenceFiles),
    releaseSet: structuredClone(releaseSet),
    now: createdAt,
  };
  mutate(copy);
  assert.throws(() => validateCiReleaseEvidence(copy));
}

assert.throws(() =>
  validateCiReleaseEvidence({
    envelope,
    policy,
    workflowText,
    evidenceFiles,
    releaseSet,
    now: createdAt,
    seenRunKeys: new Set([envelope.identity.runKey]),
  }),
);
for (const mutateWorkflow of [
  (text) => text.replace("contents: read", "contents: write"),
  (text) => text.replace("workflow_dispatch:", "pull_request_target:"),
  (text) => text.replace(policy.workflow.actions["actions/checkout"].sha, "v6"),
  (text) =>
    text.replace("persist-credentials: false", "persist-credentials: true"),
  (text) => `${text}\n    environment: production\n`,
  (text) => `${text}\n    permissions:\n      id-token: write\n`,
  (text) => `${text}\n    permissions: write-all\n`,
  (text) => `${text}\n      - run: docker push example.invalid/image\n`,
])
  assert.throws(() =>
    validateWorkflowContract(mutateWorkflow(workflowText), policy),
  );

for (const workflow of [".github/workflows/ci.yml", policy.workflow.path]) {
  const text = readFileSync(workflow, "utf8");
  const uses = [...text.matchAll(/^\s*uses:\s*\S+@([^\s#]+)/gmu)];
  assert.ok(uses.length > 0, `${workflow} must contain actions`);
  for (const use of uses)
    assert.match(
      use[1],
      /^[a-f0-9]{40}$/u,
      `${workflow} uses a mutable action`,
    );
}

console.log(
  `CI release evidence contract passed (${envelope.artifacts.length} hashed files, ${policy.workflow.retentionDays}-day retention)`,
);

function cloneBuffers(files) {
  return Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
  );
}

function syntheticReleaseSet(sourceCommit) {
  return {
    schemaVersion: 4,
    kind: "astroligyapp.release-set",
    statement: {
      source: {
        repository: policy.sourceRepository,
        commit: sourceCommit,
        tree: "b".repeat(40),
        sourceDateEpoch: 1_787_970_000,
      },
      artifacts: [
        syntheticArtifact("application", "1", "2"),
        syntheticArtifact("feedback-worker", "3", "4"),
      ],
      tools: {
        cosign: `ghcr.io/sigstore/cosign/cosign@sha256:${"5".repeat(64)}`,
        gitleaks: `ghcr.io/gitleaks/gitleaks@sha256:${"6".repeat(64)}`,
        syft: `anchore/syft@sha256:${"7".repeat(64)}`,
        trivy: `aquasec/trivy@sha256:${"8".repeat(64)}`,
      },
    },
    localVerification: null,
  };
}

function syntheticArtifact(name, imageId, imageDigest) {
  return {
    name,
    repository:
      name === "application" ? "astroligyapp" : "astroligyapp-feedback-worker",
    dockerfileSha256: `sha256:${"9".repeat(64)}`,
    baseImages: {
      build: `node:24.15.0-bookworm-slim@sha256:${"a".repeat(64)}`,
      runtime: `gcr.io/distroless/base-nossl-debian13@sha256:${"b".repeat(64)}`,
    },
    imageId: `sha256:${imageId.repeat(64)}`,
    imageDigest: `sha256:${imageDigest.repeat(64)}`,
    platform: "linux/amd64",
    reproducibleBuilds: 2,
    sbom: {
      format: "SPDX-2.3",
      sha256: `sha256:${"c".repeat(64)}`,
      packageCount: 2,
      unresolvedLicenseCount: 0,
    },
    licenses: {
      packageCount: 2,
      permittedWithNoticeCount: 1,
      manualReviewCount: 0,
      prohibitedCount: 0,
      firstPartyCount: 1,
      unresolvedCount: 0,
      policyVersion: "2026-08-25.1",
      policySha256: `sha256:${"d".repeat(64)}`,
      materialsVersion: "2026-08-28.1",
      materialsSha256: `sha256:${"e".repeat(64)}`,
      evidenceSha256: `sha256:${"f".repeat(64)}`,
      noticeSha256: `sha256:${"0".repeat(64)}`,
    },
    licenseDispositions: {
      trust: "none",
      ledgerSha256: null,
      dispositionCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      needsRemediationCount: 0,
      undisposedCount: 0,
    },
    scans: { imageSecrets: "pass", imageVulnerabilities: "pass" },
    rollbackPredecessor: null,
  };
}
