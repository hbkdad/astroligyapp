import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canonicalJson, sha256 } from "./lib/artifact-manifest.mjs";
import {
  assertPromotionActivationAllowed,
  createSyntheticProtectedPromotionEnvelope,
  validateProtectedPromotionEnvelope,
  validateTrustReadinessSnapshot,
} from "./lib/github-trust-readiness.mjs";

const policy = JSON.parse(
  readFileSync("config/github-protected-promotion-policy.json", "utf8"),
);
const snapshot = JSON.parse(
  readFileSync("docs/evidence/github-trust-readiness.snapshot.json", "utf8"),
);
const assessment = validateTrustReadinessSnapshot(snapshot, policy);
assert.equal(assessment.ready, false);
assert.equal(assessment.decision, "no-go");
assert.deepEqual(assessment.findings.map((finding) => finding.control).sort(), [
  "active-main-ruleset",
  "immutable-oidc-subject",
  "main-branch-protection",
  "protected-production-environment",
  "restricted-sha-pinned-actions",
  "verified-artifact-attestation",
]);

for (const state of ["unavailable", "unproven"]) {
  const copy = structuredClone(snapshot);
  copy.observations.rulesets = {
    state,
    httpStatus: state === "unavailable" ? 403 : null,
    reason: `synthetic-${state}`,
  };
  const result = validateTrustReadinessSnapshot(copy, policy);
  assert.equal(result.ready, false);
  assert.equal(result.findings[0].state, state);
}

const fixture = {
  commit: "a".repeat(40),
  runId: "33253450494",
  runAttempt: 1,
  releaseEnvelopeSha256: `sha256:${"b".repeat(64)}`,
  releaseSetSha256: `sha256:${"c".repeat(64)}`,
  createdAt: "2026-08-29T13:00:00.000Z",
  expiresAt: "2026-09-12T12:59:59.000Z",
  requester: "principal:fixture-requester",
  reviewers: [
    "principal:fixture-release-reviewer",
    "principal:fixture-security-reviewer",
  ],
  subjectDigest: `sha256:${"d".repeat(64)}`,
  attestationEvidenceSha256: `sha256:${"e".repeat(64)}`,
};
const now = new Date("2026-08-29T14:00:00.000Z");
const envelope = createSyntheticProtectedPromotionEnvelope(fixture, policy);
validateProtectedPromotionEnvelope(envelope, policy, { now });
assert.equal(
  canonicalJson(createSyntheticProtectedPromotionEnvelope(fixture, policy)),
  canonicalJson(envelope),
  "synthetic envelope must be deterministic",
);
assert.throws(() =>
  assertPromotionActivationAllowed(envelope, policy, { now }),
);

let rejected = 0;
for (const mutate of [
  (copy) => (copy.statement.repository.id = "999999"),
  (copy) => (copy.statement.repository.ownerId = "999999"),
  (copy) => (copy.statement.repository.ref = "refs/heads/release"),
  (copy) => (copy.statement.repositoryProtection.enforcement = "evaluate"),
  (copy) => copy.statement.repositoryProtection.bypassActors.push("admin"),
  (copy) => (copy.statement.repositoryProtection.requiresPullRequest = false),
  (copy) => (copy.statement.repositoryProtection.dismissStaleReviews = false),
  (copy) => copy.statement.repositoryProtection.requiredStatusChecks.pop(),
  (copy) => (copy.statement.workflow.commit = "main"),
  (copy) =>
    (copy.statement.workflow.workflowRef = `${policy.repository}/${policy.promotionWorkflow.path}@main`),
  (copy) => (copy.statement.workflow.permissions.contents = "write"),
  (copy) => (copy.statement.workflow.permissions.packages = "write"),
  (copy) => (copy.statement.releaseEvidence.commit = "f".repeat(40)),
  (copy) => (copy.statement.releaseEvidence.conclusion = "failure"),
  (copy) =>
    (copy.statement.releaseEvidence.runKey = `${policy.repositoryId}:replayed:1`),
  (copy) => (copy.statement.releaseEvidence.consumed = true),
  (copy) =>
    (copy.statement.releaseEvidence.expiresAt = "2026-08-29T13:30:00.000Z"),
  (copy) => (copy.statement.environment.name = "staging"),
  (copy) => (copy.statement.environment.preventSelfReview = false),
  (copy) => (copy.statement.environment.canAdminsBypass = true),
  (copy) =>
    (copy.statement.environment.reviewers = [
      copy.statement.environment.reviewers[0],
    ]),
  (copy) =>
    (copy.statement.environment.reviewers[1] =
      copy.statement.environment.reviewers[0]),
  (copy) =>
    (copy.statement.environment.reviewers[0] =
      copy.statement.environment.requester),
  (copy) => (copy.statement.oidc.useDefault = true),
  (copy) => (copy.statement.oidc.useImmutableSubject = false),
  (copy) =>
    (copy.statement.oidc.subject =
      "repo:hbkdad/astroligyapp:ref:refs/heads/main"),
  (copy) => (copy.statement.oidc.audience = "https://github.com/hbkdad"),
  (copy) => (copy.statement.attestation.sourceRepositoryId = "999999"),
  (copy) =>
    (copy.statement.attestation.signerWorkflow = `${policy.repository}/.github/workflows/other.yml`),
  (copy) => (copy.statement.attestation.sourceCommit = "f".repeat(40)),
  (copy) => (copy.statement.attestation.verified = false),
  (copy) => (copy.authorization.activationAllowed = true),
  (copy) => (copy.trust = "github-protected-promotion"),
  (copy) => (copy.privateKey = "BEGIN PRIVATE KEY"),
]) {
  const copy = structuredClone(envelope);
  mutate(copy);
  copy.scopeSha256 = sha256(canonicalJson(copy.statement));
  assert.throws(() =>
    validateProtectedPromotionEnvelope(copy, policy, { now }),
  );
  rejected += 1;
}

const scopeTamper = structuredClone(envelope);
scopeTamper.scopeSha256 = `sha256:${"0".repeat(64)}`;
assert.throws(() =>
  validateProtectedPromotionEnvelope(scopeTamper, policy, { now }),
);
rejected += 1;

assert.throws(() =>
  validateProtectedPromotionEnvelope(envelope, policy, {
    now,
    consumedRunKeys: new Set([envelope.statement.releaseEvidence.runKey]),
  }),
);
rejected += 1;

console.log(
  `GitHub trust-readiness contract passed (${assessment.findings.length} live gaps, ${rejected} unsafe promotion cases rejected)`,
);
