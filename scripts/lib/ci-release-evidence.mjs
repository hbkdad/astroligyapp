import assert from "node:assert/strict";

import {
  canonicalJson,
  sha256,
  validateReleaseSet,
} from "./artifact-manifest.mjs";

const COMMIT = /^[a-f0-9]{40}$/u;
const DIGITS = /^[1-9][0-9]*$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u;

export function createCiReleaseEvidence({
  context,
  policy,
  workflowText,
  evidenceFiles,
  releaseSet,
  createdAt,
}) {
  validateCiReleasePolicy(policy);
  validateWorkflowContract(workflowText, policy);
  validateReleaseSet(releaseSet);
  const artifacts = policy.requiredEvidenceFiles.map((path) => {
    const bytes = evidenceFiles[path];
    assert.ok(Buffer.isBuffer(bytes), `missing release evidence: ${path}`);
    return {
      path,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    };
  });
  assert.deepEqual(
    Object.keys(evidenceFiles).sort(),
    policy.requiredEvidenceFiles,
  );
  assert.equal(
    evidenceFiles["release-set.json"].toString("utf8"),
    canonicalJson(releaseSet),
    "release-set bytes are not canonical",
  );
  const created = parseUtc(createdAt, "createdAt");
  const expiresAt = new Date(
    created + policy.workflow.retentionDays * 86_400_000,
  ).toISOString();
  const runKey = `${context.repositoryId}:${context.runId}:${context.runAttempt}`;
  const envelope = {
    schemaVersion: 1,
    kind: "astroligyapp.ci-release-evidence",
    trust: "credential-free-internal-candidate",
    policyVersion: policy.policyVersion,
    policySha256: sha256(canonicalJson(policy)),
    workflowContractSha256: sha256(normalizeText(workflowText)),
    createdAt,
    expiresAt,
    identity: {
      repository: context.repository,
      repositoryId: context.repositoryId,
      repositoryOwnerId: context.repositoryOwnerId,
      commit: context.commit,
      ref: context.ref,
      event: context.event,
      workflowPath: policy.workflow.path,
      workflowRef: context.workflowRef,
      workflowSha: context.workflowSha,
      job: context.job,
      runId: context.runId,
      runAttempt: context.runAttempt,
      runNumber: context.runNumber,
      actorId: context.actorId,
      runKey,
    },
    runner: {
      environment: context.runnerEnvironment,
      label: context.runnerLabel,
      os: context.runnerOs,
      arch: context.runnerArch,
      imageOs: context.runnerImageOs,
      imageVersion: context.runnerImageVersion,
    },
    tools: structuredClone(context.tools),
    permissions: structuredClone(policy.workflow.permissions),
    approval: {
      environment: null,
      state: "not-requested",
      promotionAuthorized: false,
    },
    releaseSetSha256: sha256(evidenceFiles["release-set.json"]),
    artifactSetSha256: sha256(canonicalJson(artifacts)),
    artifacts,
  };
  validateCiReleaseEvidence({
    envelope,
    policy,
    workflowText,
    evidenceFiles,
    releaseSet,
    now: createdAt,
  });
  return Object.freeze(envelope);
}

export function validateCiReleaseEvidence({
  envelope,
  policy,
  workflowText,
  evidenceFiles,
  releaseSet,
  now,
  seenRunKeys = new Set(),
}) {
  validateCiReleasePolicy(policy);
  validateWorkflowContract(workflowText, policy);
  validateReleaseSet(releaseSet);
  assert.deepEqual(Object.keys(envelope).sort(), [
    "approval",
    "artifactSetSha256",
    "artifacts",
    "createdAt",
    "expiresAt",
    "identity",
    "kind",
    "permissions",
    "policySha256",
    "policyVersion",
    "releaseSetSha256",
    "runner",
    "schemaVersion",
    "tools",
    "trust",
    "workflowContractSha256",
  ]);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.kind, "astroligyapp.ci-release-evidence");
  assert.equal(envelope.trust, "credential-free-internal-candidate");
  assert.equal(envelope.policyVersion, policy.policyVersion);
  assert.equal(envelope.policySha256, sha256(canonicalJson(policy)));
  assert.equal(
    envelope.workflowContractSha256,
    sha256(normalizeText(workflowText)),
  );
  const created = parseUtc(envelope.createdAt, "createdAt");
  const expires = parseUtc(envelope.expiresAt, "expiresAt");
  const current = parseUtc(now, "now");
  assert.equal(
    expires - created,
    policy.workflow.retentionDays * 86_400_000,
    "evidence expiry does not match retention",
  );
  assert.ok(current >= created, "CI evidence is from the future");
  assert.ok(current < expires, "CI evidence has expired");

  validateIdentity(envelope.identity, policy, releaseSet, seenRunKeys);
  validateRunner(envelope.runner, policy);
  assert.deepEqual(envelope.permissions, policy.workflow.permissions);
  assert.deepEqual(envelope.approval, {
    environment: null,
    state: "not-requested",
    promotionAuthorized: false,
  });
  assert.deepEqual(Object.keys(envelope.tools).sort(), [
    "docker",
    "node",
    "npm",
  ]);
  assert.equal(envelope.tools.node, policy.toolVersions.node);
  assert.equal(envelope.tools.npm, policy.toolVersions.npm);
  assert.match(
    envelope.tools.docker,
    /^Docker version \d+\.\d+\.\d+, build [a-zA-Z0-9]+$/u,
  );

  assert.deepEqual(
    Object.keys(evidenceFiles).sort(),
    policy.requiredEvidenceFiles,
  );
  assert.equal(
    evidenceFiles["release-set.json"].toString("utf8"),
    canonicalJson(releaseSet),
    "release-set bytes are not canonical",
  );
  assert.equal(
    envelope.releaseSetSha256,
    sha256(evidenceFiles["release-set.json"]),
  );
  assert.equal(envelope.artifacts.length, policy.requiredEvidenceFiles.length);
  assert.deepEqual(
    envelope.artifacts.map((artifact) => artifact.path),
    policy.requiredEvidenceFiles,
  );
  for (const artifact of envelope.artifacts) {
    assert.deepEqual(Object.keys(artifact).sort(), [
      "byteLength",
      "path",
      "sha256",
    ]);
    const bytes = evidenceFiles[artifact.path];
    assert.ok(
      Buffer.isBuffer(bytes),
      `missing release evidence: ${artifact.path}`,
    );
    assert.equal(artifact.byteLength, bytes.byteLength);
    assert.equal(artifact.sha256, sha256(bytes));
  }
  assert.equal(
    envelope.artifactSetSha256,
    sha256(canonicalJson(envelope.artifacts)),
  );
  return true;
}

export function validateWorkflowContract(workflowText, policy) {
  validateCiReleasePolicy(policy);
  const workflow = normalizeText(workflowText);
  for (const forbidden of [
    /pull_request(?:_target)?:/u,
    /\bsecrets\./u,
    /^\s*environment:/mu,
    /^\s*(?:id-token|attestations|packages|deployments):/mu,
    /aws-actions\//u,
    /\bdocker\s+push\b/iu,
    /\b(?:aws|gcloud|az)\s+/iu,
  ])
    assert.doesNotMatch(workflow, forbidden);
  assert.match(workflow, /^\s{2}push:\n\s{4}branches:\n\s{6}- main$/mu);
  assert.match(workflow, /^\s{2}workflow_dispatch:$/mu);
  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.equal(
    (workflow.match(/^\s*permissions:/gmu) ?? []).length,
    1,
    "workflow must declare exactly one permission block",
  );
  assert.match(workflow, /^\s{4}runs-on: ubuntu-24\.04$/mu);
  assert.match(workflow, /^\s{4}timeout-minutes: 90$/mu);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.match(workflow, /npm run release:check/u);
  assert.match(workflow, /npm run ci:release:evidence/u);
  assert.match(workflow, /if-no-files-found: error/u);
  assert.match(workflow, /include-hidden-files: false/u);
  assert.match(workflow, /overwrite: false/u);
  assert.match(
    workflow,
    new RegExp(`retention-days: ${policy.workflow.retentionDays}`, "u"),
  );
  assert.match(workflow, /github\.repository == 'hbkdad\/astroligyapp'/u);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /github\.event_name == 'push'/u);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/u);
  assert.deepEqual(
    [...workflow.matchAll(/^\s*run:\s*(.+)$/gmu)].map((match) => match[1]),
    ["npm ci", "npm run release:check", "npm run ci:release:evidence"],
  );
  const uses = [
    ...workflow.matchAll(
      /^\s*uses:\s*([^@\s]+)@([a-f0-9]{40})(?:\s+#\s+(.+))?$/gmu,
    ),
  ].map((match) => ({ action: match[1], sha: match[2], comment: match[3] }));
  assert.deepEqual(
    uses.map(({ action }) => action).sort(),
    Object.keys(policy.workflow.actions).sort(),
  );
  for (const use of uses) {
    const expected = policy.workflow.actions[use.action];
    assert.equal(use.sha, expected.sha);
    assert.equal(use.comment, expected.release);
  }
  assert.equal((workflow.match(/^\s*uses:/gmu) ?? []).length, uses.length);
  return true;
}

export function validateCiReleasePolicy(policy) {
  assert.equal(policy.schemaVersion, 1);
  assert.match(policy.policyVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/u);
  assert.equal(policy.repository, "hbkdad/astroligyapp");
  assert.match(policy.repositoryId, DIGITS);
  assert.match(policy.repositoryOwnerId, DIGITS);
  assert.equal(
    policy.sourceRepository,
    `https://github.com/${policy.repository}`,
  );
  assert.deepEqual(policy.workflow.allowedEvents, [
    "push",
    "workflow_dispatch",
  ]);
  assert.equal(policy.workflow.path, ".github/workflows/release-candidate.yml");
  assert.equal(policy.workflow.ref, "refs/heads/main");
  assert.equal(policy.workflow.job, "release-candidate");
  assert.equal(policy.workflow.runnerLabel, "ubuntu-24.04");
  assert.deepEqual(policy.workflow.permissions, { contents: "read" });
  assert.equal(policy.workflow.retentionDays, 14);
  assert.deepEqual(Object.keys(policy.workflow.actions).sort(), [
    "actions/checkout",
    "actions/setup-node",
    "actions/upload-artifact",
  ]);
  for (const action of Object.values(policy.workflow.actions)) {
    assert.match(action.sha, COMMIT);
    assert.match(action.release, /^v\d+\.\d+\.\d+$/u);
  }
  assert.deepEqual(policy.toolVersions, { node: "v24.15.0", npm: "11.12.1" });
  assert.deepEqual(
    [...policy.requiredEvidenceFiles].sort(),
    policy.requiredEvidenceFiles,
  );
  assert.ok(policy.requiredEvidenceFiles.includes("release-set.json"));
  assert.equal(
    new Set(policy.requiredEvidenceFiles).size,
    policy.requiredEvidenceFiles.length,
  );
  for (const path of policy.requiredEvidenceFiles)
    assert.match(path, /^[A-Za-z0-9][A-Za-z0-9._-]+$/u);
  return true;
}

function validateIdentity(identity, policy, releaseSet, seenRunKeys) {
  assert.deepEqual(Object.keys(identity).sort(), [
    "actorId",
    "commit",
    "event",
    "job",
    "ref",
    "repository",
    "repositoryId",
    "repositoryOwnerId",
    "runAttempt",
    "runId",
    "runKey",
    "runNumber",
    "workflowPath",
    "workflowRef",
    "workflowSha",
  ]);
  assert.equal(identity.repository, policy.repository);
  assert.equal(identity.repositoryId, policy.repositoryId);
  assert.equal(identity.repositoryOwnerId, policy.repositoryOwnerId);
  assert.match(identity.commit, COMMIT);
  assert.equal(identity.commit, identity.workflowSha);
  assert.equal(identity.commit, releaseSet.statement.source.commit);
  assert.equal(releaseSet.statement.source.repository, policy.sourceRepository);
  assert.equal(identity.ref, policy.workflow.ref);
  assert.ok(policy.workflow.allowedEvents.includes(identity.event));
  assert.equal(identity.workflowPath, policy.workflow.path);
  assert.equal(
    identity.workflowRef,
    `${policy.repository}/${policy.workflow.path}@${policy.workflow.ref}`,
  );
  assert.equal(identity.job, policy.workflow.job);
  for (const field of ["runId", "runAttempt", "runNumber", "actorId"])
    assert.match(identity[field], DIGITS);
  assert.equal(
    identity.runKey,
    `${policy.repositoryId}:${identity.runId}:${identity.runAttempt}`,
  );
  assert.ok(!seenRunKeys.has(identity.runKey), "CI evidence run was replayed");
}

function validateRunner(runner, policy) {
  assert.deepEqual(Object.keys(runner).sort(), [
    "arch",
    "environment",
    "imageOs",
    "imageVersion",
    "label",
    "os",
  ]);
  assert.equal(runner.environment, "github-hosted");
  assert.equal(runner.label, policy.workflow.runnerLabel);
  assert.equal(runner.os, "Linux");
  assert.equal(runner.arch, "X64");
  assert.match(runner.imageOs, /^ubuntu\d{2}$/u);
  assert.match(runner.imageVersion, /^\d{8}\.\d+(?:\.\d+)?$/u);
}

function parseUtc(value, field) {
  assert.match(value, UTC, `${field} must be canonical UTC`);
  const parsed = Date.parse(value);
  assert.ok(Number.isSafeInteger(parsed), `invalid ${field}`);
  return parsed;
}

function normalizeText(value) {
  return value.replace(/\r\n/gu, "\n");
}
