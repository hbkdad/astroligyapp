import assert from "node:assert/strict";

import { canonicalJson, sha256 } from "./artifact-manifest.mjs";

const COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const DIGITS = /^[0-9]+$/u;
const PRINCIPAL = /^principal:[a-z0-9][a-z0-9-]{2,63}$/u;
const EVIDENCE_STATES = new Set(["observed", "unavailable", "unproven"]);
const MAX_EVIDENCE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function validateTrustReadinessSnapshot(snapshot, policy) {
  validatePolicy(policy);
  assertExactKeys(snapshot, [
    "apiVersion",
    "capturedAt",
    "kind",
    "observations",
    "repository",
    "schemaVersion",
  ]);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.kind, "astroligyapp.github-trust-readiness-snapshot");
  assert.match(snapshot.apiVersion, /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/u);
  parseInstant(snapshot.capturedAt, "snapshot capture time");
  assert.deepEqual(snapshot.repository, {
    name: policy.repository,
    id: policy.repositoryId,
    ownerId: policy.repositoryOwnerId,
    visibility: "public",
    defaultBranch: policy.defaultBranch,
    fork: false,
  });

  const expected = [
    "actionsPolicy",
    "artifactAttestation",
    "branchProtection",
    "environments",
    "oidcSubject",
    "rulesets",
    "workflowPermissions",
  ];
  assert.deepEqual(Object.keys(snapshot.observations).sort(), expected);
  for (const observation of Object.values(snapshot.observations)) {
    assert.ok(EVIDENCE_STATES.has(observation.state), "invalid evidence state");
    if (observation.state === "observed") {
      assert.ok(
        Number.isInteger(observation.httpStatus),
        "observed evidence requires an HTTP status",
      );
    } else {
      assert.equal(
        typeof observation.reason,
        "string",
        "non-observed evidence requires a reason",
      );
    }
  }

  const observations = snapshot.observations;
  const findings = [];
  requireObserved(
    observations.rulesets,
    observations.rulesets.activeMainRulesetCount > 0,
    "active-main-ruleset",
    findings,
  );
  requireObserved(
    observations.branchProtection,
    observations.branchProtection.protected === true,
    "main-branch-protection",
    findings,
  );
  requireObserved(
    observations.environments,
    environmentMatches(observations.environments.production, policy),
    "protected-production-environment",
    findings,
  );
  requireObserved(
    observations.actionsPolicy,
    observations.actionsPolicy.enabled === true &&
      observations.actionsPolicy.allowedActions ===
        policy.actions.allowedActions &&
      observations.actionsPolicy.shaPinningRequired === true,
    "restricted-sha-pinned-actions",
    findings,
  );
  requireObserved(
    observations.workflowPermissions,
    observations.workflowPermissions.defaultWorkflowPermissions === "read" &&
      observations.workflowPermissions.canApprovePullRequestReviews === false,
    "least-privilege-workflow-token",
    findings,
  );
  requireObserved(
    observations.oidcSubject,
    observations.oidcSubject.useDefault === false &&
      observations.oidcSubject.useImmutableSubject === true,
    "immutable-oidc-subject",
    findings,
  );
  requireObserved(
    observations.artifactAttestation,
    observations.artifactAttestation.verified === true,
    "verified-artifact-attestation",
    findings,
  );

  return {
    ready: findings.length === 0,
    decision: findings.length === 0 ? "ready" : "no-go",
    snapshotSha256: sha256(canonicalJson(snapshot)),
    findings,
  };
}

export function createSyntheticProtectedPromotionEnvelope(fixture, policy) {
  validatePolicy(policy);
  const statement = {
    repository: {
      name: policy.repository,
      id: policy.repositoryId,
      ownerId: policy.repositoryOwnerId,
      ref: policy.protectedRef,
    },
    repositoryProtection: {
      target: "branch",
      protectedRef: policy.protectedRef,
      enforcement: "active",
      bypassActors: [],
      requiresPullRequest: true,
      dismissStaleReviews: true,
      requiredApprovingReviewCount: 1,
      requiredStatusChecks: [...policy.requiredStatusChecks],
    },
    workflow: {
      path: policy.promotionWorkflow.path,
      job: policy.promotionWorkflow.job,
      commit: fixture.commit,
      workflowRef: `${policy.repository}/${policy.promotionWorkflow.path}@${fixture.commit}`,
      permissions: {
        contents: "read",
        "id-token": "write",
        attestations: "read",
      },
    },
    releaseEvidence: {
      commit: fixture.commit,
      workflowPath: policy.releaseWorkflow.path,
      workflowJob: policy.releaseWorkflow.job,
      runId: fixture.runId,
      runAttempt: fixture.runAttempt,
      runKey: `${policy.repositoryId}:${fixture.runId}:${fixture.runAttempt}`,
      conclusion: "success",
      envelopeSha256: fixture.releaseEnvelopeSha256,
      releaseSetSha256: fixture.releaseSetSha256,
      expiresAt: fixture.expiresAt,
      consumed: false,
    },
    environment: {
      name: policy.environment,
      reviewers: [...fixture.reviewers],
      requester: fixture.requester,
      minimumIndependentReviewers: policy.review.minimumIndependentReviewers,
      preventSelfReview: true,
      canAdminsBypass: false,
      protectedRef: policy.protectedRef,
    },
    oidc: structuredClone(policy.oidc),
    attestation: {
      ...structuredClone(policy.attestation),
      subjectDigest: fixture.subjectDigest,
      sourceCommit: fixture.commit,
      verified: true,
      verificationEvidenceSha256: fixture.attestationEvidenceSha256,
    },
  };
  return {
    schemaVersion: 1,
    kind: "astroligyapp.protected-promotion-configuration",
    trust: "synthetic-non-authorizing",
    policyVersion: policy.policyVersion,
    createdAt: fixture.createdAt,
    statement,
    scopeSha256: sha256(canonicalJson(statement)),
    authorization: {
      decision: "not-authorized",
      activationAllowed: false,
      reason: "synthetic-contract-only",
    },
  };
}

export function validateProtectedPromotionEnvelope(
  envelope,
  policy,
  { now = new Date(), consumedRunKeys = new Set() } = {},
) {
  validatePolicy(policy);
  assertExactKeys(envelope, [
    "authorization",
    "createdAt",
    "kind",
    "policyVersion",
    "schemaVersion",
    "scopeSha256",
    "statement",
    "trust",
  ]);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.kind, "astroligyapp.protected-promotion-configuration");
  assert.equal(envelope.trust, "synthetic-non-authorizing");
  assert.equal(envelope.policyVersion, policy.policyVersion);
  const createdAt = parseInstant(envelope.createdAt, "createdAt");
  assert.ok(createdAt <= now.getTime() + 5 * 60 * 1000, "future envelope");
  assert.equal(
    envelope.scopeSha256,
    sha256(canonicalJson(envelope.statement)),
    "promotion scope digest mismatch",
  );
  assert.deepEqual(envelope.authorization, {
    decision: "not-authorized",
    activationAllowed: false,
    reason: "synthetic-contract-only",
  });

  const {
    repository,
    repositoryProtection,
    workflow,
    releaseEvidence,
    environment,
    oidc,
    attestation,
  } = envelope.statement;
  assert.deepEqual(repository, {
    name: policy.repository,
    id: policy.repositoryId,
    ownerId: policy.repositoryOwnerId,
    ref: policy.protectedRef,
  });
  assert.deepEqual(repositoryProtection, {
    target: "branch",
    protectedRef: policy.protectedRef,
    enforcement: "active",
    bypassActors: [],
    requiresPullRequest: true,
    dismissStaleReviews: true,
    requiredApprovingReviewCount: 1,
    requiredStatusChecks: policy.requiredStatusChecks,
  });
  assert.equal(workflow.path, policy.promotionWorkflow.path);
  assert.equal(workflow.job, policy.promotionWorkflow.job);
  assert.match(workflow.commit, COMMIT);
  assert.equal(
    workflow.workflowRef,
    `${policy.repository}/${policy.promotionWorkflow.path}@${workflow.commit}`,
  );
  assert.deepEqual(workflow.permissions, {
    contents: "read",
    "id-token": "write",
    attestations: "read",
  });

  assert.equal(releaseEvidence.commit, workflow.commit);
  assert.equal(releaseEvidence.workflowPath, policy.releaseWorkflow.path);
  assert.equal(releaseEvidence.workflowJob, policy.releaseWorkflow.job);
  assert.match(String(releaseEvidence.runId), DIGITS);
  assert.ok(Number.isInteger(releaseEvidence.runAttempt));
  assert.ok(releaseEvidence.runAttempt > 0);
  assert.equal(
    releaseEvidence.runKey,
    `${policy.repositoryId}:${releaseEvidence.runId}:${releaseEvidence.runAttempt}`,
  );
  assert.equal(releaseEvidence.conclusion, "success");
  assert.match(releaseEvidence.envelopeSha256, DIGEST);
  assert.match(releaseEvidence.releaseSetSha256, DIGEST);
  assert.equal(releaseEvidence.consumed, false);
  assert.ok(!consumedRunKeys.has(releaseEvidence.runKey), "release replay");
  const expiresAt = parseInstant(releaseEvidence.expiresAt, "evidence expiry");
  assert.ok(expiresAt > now.getTime(), "release evidence expired");
  assert.ok(
    expiresAt - createdAt <= MAX_EVIDENCE_AGE_MS,
    "excessive evidence lifetime",
  );

  assert.equal(environment.name, policy.environment);
  assert.equal(environment.protectedRef, policy.protectedRef);
  assert.equal(environment.preventSelfReview, true);
  assert.equal(environment.canAdminsBypass, false);
  assert.equal(
    environment.minimumIndependentReviewers,
    policy.review.minimumIndependentReviewers,
  );
  assert.match(environment.requester, PRINCIPAL);
  assert.equal(
    environment.reviewers.length,
    policy.review.minimumIndependentReviewers,
  );
  const reviewers = new Set(environment.reviewers);
  assert.equal(
    reviewers.size,
    environment.reviewers.length,
    "duplicate reviewer",
  );
  for (const reviewer of reviewers) {
    assert.match(reviewer, PRINCIPAL);
    assert.notEqual(reviewer, environment.requester, "self-review");
  }

  assert.deepEqual(oidc, policy.oidc);
  assert.deepEqual(
    {
      issuer: attestation.issuer,
      sourceRepository: attestation.sourceRepository,
      sourceRepositoryId: attestation.sourceRepositoryId,
      signerWorkflow: attestation.signerWorkflow,
    },
    policy.attestation,
  );
  assert.match(attestation.subjectDigest, DIGEST);
  assert.equal(attestation.sourceCommit, workflow.commit);
  assert.equal(attestation.verified, true);
  assert.match(attestation.verificationEvidenceSha256, DIGEST);
  assertNoSensitiveMaterial(envelope);
  return envelope;
}

export function assertPromotionActivationAllowed(envelope, policy, options) {
  validateProtectedPromotionEnvelope(envelope, policy, options);
  assert.fail("synthetic promotion configuration cannot authorize activation");
}

function environmentMatches(environment, policy) {
  if (!environment) return false;
  return (
    environment.name === policy.environment &&
    environment.preventSelfReview === true &&
    environment.canAdminsBypass === false &&
    environment.protectedRef === policy.protectedRef &&
    environment.requiredReviewerCount >=
      policy.review.minimumIndependentReviewers
  );
}

function requireObserved(observation, passes, control, findings) {
  if (observation.state !== "observed") {
    findings.push({
      control,
      state: observation.state,
      reason: observation.reason,
    });
  } else if (!passes) {
    findings.push({
      control,
      state: "observed",
      reason: "requirement-not-met",
    });
  }
}

function validatePolicy(policy) {
  assert.equal(policy.schemaVersion, 1);
  assert.match(policy.repositoryId, DIGITS);
  assert.match(policy.repositoryOwnerId, DIGITS);
  assert.equal(policy.protectedRef, `refs/heads/${policy.defaultBranch}`);
  assert.equal(policy.actions.allowedActions, "selected");
  assert.equal(policy.actions.shaPinningRequired, true);
  assert.equal(policy.actions.defaultWorkflowPermissions, "read");
  assert.equal(policy.actions.canApprovePullRequestReviews, false);
  assert.ok(policy.review.minimumIndependentReviewers >= 2);
  assert.equal(policy.review.preventSelfReview, true);
  assert.equal(policy.review.canAdminsBypass, false);
  assert.equal(policy.oidc.useDefault, false);
  assert.equal(policy.oidc.useImmutableSubject, true);
  assert.match(policy.oidc.subject, /@1329276081:environment:production$/u);
  assert.equal(policy.oidc.audience, "sts.amazonaws.com");
  assert.ok(policy.requiredStatusChecks.includes("CI"));
  assert.ok(policy.requiredStatusChecks.includes("release-candidate"));
}

function assertNoSensitiveMaterial(value) {
  const text = canonicalJson(value);
  assert.doesNotMatch(
    text,
    /(private.?key|client.?secret|access.?key|session.?token|authorization: bearer)/iu,
  );
}

function parseInstant(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  const parsed = Date.parse(value);
  assert.ok(Number.isFinite(parsed), `${label} is invalid`);
  assert.equal(
    new Date(parsed).toISOString(),
    value,
    `${label} is not canonical`,
  );
  return parsed;
}

function assertExactKeys(value, expected) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
}
