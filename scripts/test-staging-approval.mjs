import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canonicalJson, sha256 } from "./lib/artifact-manifest.mjs";
import {
  COST_SERVICES,
  DOCUMENT_GATES,
  LIVE_GATES,
  REVIEW_ROLES,
  assertDocumentaryApprovalReady,
  assertStagingApplyReady,
  createCredentialFreeStagingPackage,
  stagingApprovalScopeSha256,
  stagingPlanSummarySha256,
  validateStagingApprovalPackage,
} from "./lib/staging-approval.mjs";

const fixture = JSON.parse(
  readFileSync("infra/aws/approval/staging-review.fixture.json", "utf8"),
);
const now = new Date("2026-08-25T14:00:00.000Z");
const preparation = createCredentialFreeStagingPackage(fixture);
validateStagingApprovalPackage(preparation, { now });
assert.equal(
  canonicalJson(createCredentialFreeStagingPackage(fixture)),
  canonicalJson(preparation),
  "credential-free generation must be deterministic",
);
assert.deepEqual(
  preparation.statement.costReview.serviceInputs.map((entry) => entry.service),
  [...COST_SERVICES],
);
assert.deepEqual(
  preparation.statement.preflight
    .filter((gate) => gate.evidenceClass === "live-environment")
    .map((gate) => gate.id)
    .sort(),
  [...LIVE_GATES],
);
assert.throws(() => assertDocumentaryApprovalReady(preparation, { now }));
assert.throws(() => assertStagingApplyReady(preparation, { now }));

const documentary = makeDocumentaryReady(preparation);
assertDocumentaryApprovalReady(documentary, { now });
assert.throws(() => assertStagingApplyReady(documentary, { now }));

const applyReady = structuredClone(documentary);
for (const gate of applyReady.statement.preflight) {
  if (LIVE_GATES.includes(gate.id)) {
    gate.status = "verified-live";
    gate.evidenceSha256 = sha256(
      canonicalJson({ gate: gate.id, synthetic: true }),
    );
  }
}
rescope(applyReady);
applyReady.applyAuthorization = {
  decision: "authorize-staging-apply",
  evidenceSha256: `sha256:${"f".repeat(64)}`,
  reviewerId: "principal:fixture-apply-authorizer",
  reviewedAt: "2026-08-25T13:30:00.000Z",
  scopeSha256: applyReady.review.scopeSha256,
};
assertStagingApplyReady(applyReady, { now });

let rejected = 0;
for (const mutate of [
  (copy) => delete copy.statement.target.accountId,
  (copy) => (copy.statement.target.environment = "production"),
  (copy) => (copy.statement.target.region = "us-east-1"),
  (copy) =>
    (copy.statement.release.releaseSetSha256 = `sha256:${"f".repeat(64)}`),
  (copy) =>
    (copy.statement.release.artifacts[0].subject = "astroligyapp:latest"),
  (copy) =>
    (copy.statement.release.artifacts[0].rollbackPredecessor =
      copy.statement.release.artifacts[0].subject),
  (copy) =>
    (copy.statement.plan.redactedSummarySha256 = `sha256:${"f".repeat(64)}`),
  (copy) => (copy.statement.plan.accountId = "999999999999"),
  (copy) => copy.statement.preflight.pop(),
  (copy) =>
    copy.statement.preflight.push(structuredClone(copy.statement.preflight[0])),
  (copy) => (copy.statement.preflight[0].status = "passed"),
  (copy) => (copy.statement.owners.release = copy.statement.owners.security),
  (copy) => (copy.statement.owners.release = "owner@example.invalid"),
  (copy) => (copy.statement.generatedAt = "2026-08-25T12:00:00Z"),
  (copy) => (copy.statement.validUntil = "2026-09-25T12:00:00.000Z"),
  (copy) => (copy.statement.changeWindow.timezone = "America/Toronto"),
  (copy) => (copy.statement.changeWindow.end = "2026-08-27T00:00:00.000Z"),
  (copy) => (copy.statement.recovery.rpoMinutes = 0),
  (copy) => (copy.statement.dataHandling.productionDataAllowed = true),
  (copy) => (copy.review.scopeSha256 = `sha256:${"f".repeat(64)}`),
  (copy) => (copy.applyAuthorization.scopeSha256 = `sha256:${"f".repeat(64)}`),
  (copy) => (copy.privateKey = "BEGIN PRIVATE KEY"),
]) {
  const copy = structuredClone(preparation);
  mutate(copy);
  assert.throws(() => validateStagingApprovalPackage(copy, { now }));
  rejected += 1;
}

for (const mutate of [
  (copy) => (copy.statement.plan.savedPlanSha256 = null),
  (copy) => (copy.statement.plan.changeCounts.delete = 1),
  (copy) => (copy.statement.plan.changeCounts.replace = 1),
  (copy) => (copy.statement.costReview.status = "calculator-required"),
  (copy) => (copy.statement.costReview.monthlyEstimate = 90_001),
  (copy) => copy.review.decisions.pop(),
  (copy) =>
    (copy.review.decisions[1].reviewerId = copy.review.decisions[0].reviewerId),
  (copy) => (copy.review.decisions[0].reviewerId = copy.review.requesterId),
]) {
  const copy = structuredClone(documentary);
  mutate(copy);
  if (copy.statement.plan.redactedSummarySha256)
    copy.statement.plan.redactedSummarySha256 = stagingPlanSummarySha256(
      copy.statement.plan,
    );
  if (copy.statement.costReview.status === "calculator-required") {
    copy.statement.costReview.estimateCreatedAt = null;
    copy.statement.costReview.calculatorExportSha256 = null;
    copy.statement.costReview.monthlyEstimate = null;
    copy.statement.costReview.monthlyBudget = null;
    copy.statement.costReview.anomalyThreshold = null;
  }
  rescope(copy);
  assert.throws(() => assertDocumentaryApprovalReady(copy, { now }));
  rejected += 1;
}

for (const mutate of [
  (copy) => {
    const gate = copy.statement.preflight.find(
      (entry) => entry.id === "rekor-inclusion",
    );
    gate.status = "pending-external";
    gate.evidenceSha256 = null;
  },
  (copy) => (copy.applyAuthorization.decision = "not-authorized"),
  (copy) =>
    (copy.applyAuthorization.reviewerId = copy.review.decisions[0].reviewerId),
]) {
  const copy = structuredClone(applyReady);
  mutate(copy);
  if (copy.applyAuthorization.decision === "not-authorized") {
    copy.applyAuthorization.evidenceSha256 = null;
    copy.applyAuthorization.reviewerId = null;
    copy.applyAuthorization.reviewedAt = null;
  }
  rescope(copy);
  copy.applyAuthorization.scopeSha256 = copy.review.scopeSha256;
  assert.throws(() => assertStagingApplyReady(copy, { now }));
  rejected += 1;
}

for (const mutate of [
  (copy) => (copy.review.decisions[0].scopeSha256 = `sha256:${"0".repeat(64)}`),
  (copy) => (copy.review.decisions[0].evidenceSha256 = null),
  (copy) => (copy.review.decisions[0].reviewedAt = "2026-08-25T15:00:00.000Z"),
  (copy) => (copy.applyAuthorization.evidenceSha256 = null),
  (copy) => (copy.applyAuthorization.reviewedAt = "2026-08-25T15:00:00.000Z"),
]) {
  const copy = structuredClone(applyReady);
  mutate(copy);
  assert.throws(() => validateStagingApprovalPackage(copy, { now }));
  rejected += 1;
}

assert.throws(() =>
  validateStagingApprovalPackage(preparation, {
    now: new Date("2026-08-28T13:00:00.000Z"),
  }),
);
rejected += 1;

console.log(
  `staging approval contract passed (${DOCUMENT_GATES.length} documentary gates, ${LIVE_GATES.length} live gates, ${rejected} unsafe cases rejected)`,
);

function makeDocumentaryReady(source) {
  const envelope = structuredClone(source);
  envelope.statement.plan.evidenceClass = "saved-plan-reviewed";
  envelope.statement.plan.savedPlanSha256 = `sha256:${"d".repeat(64)}`;
  envelope.statement.plan.changeCounts = {
    create: 42,
    update: 0,
    delete: 0,
    replace: 0,
  };
  envelope.statement.plan.redactedSummarySha256 = stagingPlanSummarySha256(
    envelope.statement.plan,
  );
  Object.assign(envelope.statement.costReview, {
    status: "calculator-reviewed",
    estimateCreatedAt: "2026-08-25T11:00:00.000Z",
    calculatorExportSha256: `sha256:${"e".repeat(64)}`,
    monthlyEstimate: 20_000,
    monthlyBudget: 90_000,
    anomalyThreshold: 30_000,
  });
  for (const gate of envelope.statement.preflight) {
    if (DOCUMENT_GATES.includes(gate.id)) {
      gate.status = "verified-local";
      gate.evidenceSha256 = sha256(
        canonicalJson({ gate: gate.id, synthetic: true }),
      );
    }
  }
  rescope(envelope);
  envelope.review.decisions = REVIEW_ROLES.map((role) => ({
    role,
    decision: "approved",
    evidenceSha256: sha256(canonicalJson({ role, synthetic: true })),
    reviewerId: `principal:fixture-${role}-reviewer`,
    reviewedAt: "2026-08-25T13:15:00.000Z",
    scopeSha256: envelope.review.scopeSha256,
  }));
  return envelope;
}

function rescope(envelope) {
  const scopeSha256 = stagingApprovalScopeSha256(envelope.statement);
  envelope.review.scopeSha256 = scopeSha256;
  for (const decision of envelope.review.decisions)
    decision.scopeSha256 = scopeSha256;
  envelope.applyAuthorization.scopeSha256 = scopeSha256;
}
