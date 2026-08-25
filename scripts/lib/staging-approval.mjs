import assert from "node:assert/strict";

import { canonicalJson, sha256 } from "./artifact-manifest.mjs";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const ACCOUNT = /^[0-9]{12}$/u;
const PRINCIPAL = /^(principal|team):[a-z0-9][a-z0-9-]{2,63}$/u;
const MAX_PACKAGE_AGE_MS = 72 * 60 * 60 * 1000;
const MAX_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CHANGE_WINDOW_MS = 4 * 60 * 60 * 1000;
const MAX_COST_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const DOCUMENT_GATES = Object.freeze([
  "change-window",
  "cost-review",
  "data-handling",
  "owner-roster",
  "plan-structure",
  "recovery-targets",
  "release-set",
]);

export const LIVE_GATES = Object.freeze([
  "accessibility-smoke",
  "alarm-routing",
  "application-rollback",
  "database-restore",
  "dns-tls",
  "ecr-referrers",
  "github-oidc-identity",
  "iam-kms",
  "queue-redrive",
  "rekor-inclusion",
  "state-recovery",
  "worker-rollback",
]);

export const REVIEW_ROLES = Object.freeze([
  "cost",
  "release",
  "rollback",
  "security",
]);

export const COST_SERVICES = Object.freeze([
  "alb",
  "aws-backup",
  "cloudfront-waf",
  "cloudwatch",
  "data-transfer",
  "ecr",
  "ecs-fargate",
  "kms-secrets-manager",
  "nat-gateway",
  "rds-postgresql",
  "ses-sns-sqs",
  "valkey",
]);

export function createCredentialFreeStagingPackage(fixture) {
  validateFixture(fixture);
  const planSummary = Object.freeze({
    evidenceClass: "mock-contract-only",
    environment: fixture.environment,
    accountId: fixture.accountId,
    region: fixture.region,
    sourceRevision: fixture.sourceRevision,
    releaseSetSha256: fixture.releaseSetSha256,
    savedPlanSha256: null,
    changeCounts: null,
    resourceCounts: fixture.resourceCounts,
    capacity: fixture.capacity,
    retention: fixture.retention,
    securityContract: fixture.securityContract,
  });
  const costServiceInputs = fixture.costServiceInputs
    .map((entry) => ({
      service: entry.service,
      assumptions: [...entry.assumptions],
    }))
    .sort((left, right) => left.service.localeCompare(right.service));
  const statement = {
    generatedAt: fixture.generatedAt,
    validUntil: fixture.validUntil,
    target: {
      environment: fixture.environment,
      accountId: fixture.accountId,
      region: fixture.region,
    },
    release: {
      sourceRevision: fixture.sourceRevision,
      releaseSetSha256: fixture.releaseSetSha256,
      artifacts: fixture.artifacts,
    },
    plan: {
      ...planSummary,
      redactedSummarySha256: sha256(canonicalJson(planSummary)),
    },
    costReview: {
      status: "calculator-required",
      currency: "USD",
      estimateCreatedAt: null,
      calculatorExportSha256: null,
      assumptionsSha256: sha256(canonicalJson(costServiceInputs)),
      monthlyEstimate: null,
      monthlyBudget: null,
      anomalyThreshold: null,
      serviceInputs: costServiceInputs,
    },
    changeWindow: fixture.changeWindow,
    owners: fixture.owners,
    recovery: fixture.recovery,
    dataHandling: {
      classification: "synthetic-only",
      productionDataAllowed: false,
      publicIndexingEnabled: false,
      privateDataInRoutineLogsAllowed: false,
      canadianRegionOnly: true,
    },
    preflight: [
      ...DOCUMENT_GATES.map((id) => ({
        id,
        evidenceClass: "local-documentary",
        status: id === "cost-review" ? "pending-external" : "verified-local",
        evidenceSha256:
          id === "cost-review"
            ? null
            : sha256(canonicalJson({ id, planSummary })),
      })),
      ...LIVE_GATES.map((id) => ({
        id,
        evidenceClass: "live-environment",
        status: "pending-external",
        evidenceSha256: null,
      })),
    ],
  };
  const scopeSha256 = stagingApprovalScopeSha256(statement);
  return {
    schemaVersion: 1,
    kind: "astroligyapp.staging-approval",
    statement,
    review: {
      authorization: "documentary-only",
      requesterId: fixture.requesterId,
      scopeSha256,
      decisions: [],
    },
    applyAuthorization: {
      decision: "not-authorized",
      evidenceSha256: null,
      reviewerId: null,
      reviewedAt: null,
      scopeSha256,
    },
  };
}

export function validateStagingApprovalPackage(
  envelope,
  { now = new Date() } = {},
) {
  assertExactKeys(envelope, [
    "applyAuthorization",
    "kind",
    "review",
    "schemaVersion",
    "statement",
  ]);
  assert.equal(envelope.schemaVersion, 1, "unsupported approval schema");
  assert.equal(
    envelope.kind,
    "astroligyapp.staging-approval",
    "unexpected approval kind",
  );
  const statement = envelope.statement;
  assertExactKeys(statement, [
    "changeWindow",
    "costReview",
    "dataHandling",
    "generatedAt",
    "owners",
    "plan",
    "preflight",
    "recovery",
    "release",
    "target",
    "validUntil",
  ]);
  const generatedAt = parseInstant(statement.generatedAt, "generatedAt");
  const validUntil = parseInstant(statement.validUntil, "validUntil");
  assert.ok(validUntil > generatedAt, "approval validity must move forward");
  assert.ok(
    validUntil - generatedAt <= MAX_VALIDITY_MS,
    "approval validity exceeds seven days",
  );
  assert.ok(
    now.getTime() >= generatedAt - 5 * 60 * 1000,
    "approval package is from the future",
  );
  assert.ok(
    now.getTime() - generatedAt <= MAX_PACKAGE_AGE_MS,
    "approval package is stale",
  );
  assert.ok(now.getTime() <= validUntil, "approval package expired");

  assert.deepEqual(statement.target, {
    environment: "staging",
    accountId: statement.target.accountId,
    region: "ca-central-1",
  });
  assert.match(statement.target.accountId, ACCOUNT, "invalid AWS account");

  validateRelease(statement.release, statement.target.accountId);
  validatePlan(statement.plan, statement);
  validateCostReview(statement.costReview, generatedAt);
  validateChangeWindow(statement.changeWindow, generatedAt, validUntil);
  validateOwners(statement.owners);
  validateRecovery(statement.recovery);
  assert.deepEqual(statement.dataHandling, {
    classification: "synthetic-only",
    productionDataAllowed: false,
    publicIndexingEnabled: false,
    privateDataInRoutineLogsAllowed: false,
    canadianRegionOnly: true,
  });
  validatePreflight(statement.preflight);

  const scopeSha256 = stagingApprovalScopeSha256(statement);
  validateReview(
    envelope.review,
    scopeSha256,
    generatedAt,
    validUntil,
    now.getTime(),
  );
  validateApplyAuthorization(
    envelope.applyAuthorization,
    scopeSha256,
    generatedAt,
    validUntil,
    now.getTime(),
  );
  assertNoSensitiveOrContactMaterial(envelope);
  return envelope;
}

export function assertDocumentaryApprovalReady(envelope, options) {
  validateStagingApprovalPackage(envelope, options);
  assert.equal(
    envelope.statement.plan.evidenceClass,
    "saved-plan-reviewed",
    "a reviewed saved plan is required",
  );
  assert.match(
    envelope.statement.plan.savedPlanSha256,
    SHA256,
    "saved plan digest is required",
  );
  assertChangeCounts(envelope.statement.plan.changeCounts);
  assert.equal(
    envelope.statement.costReview.status,
    "calculator-reviewed",
    "current calculator review is required",
  );
  for (const id of DOCUMENT_GATES) {
    const gate = envelope.statement.preflight.find((entry) => entry.id === id);
    assert.equal(gate.status, "verified-local", `${id} is not verified`);
    assert.match(gate.evidenceSha256, SHA256);
  }
  assert.deepEqual(
    envelope.review.decisions.map((decision) => decision.role).sort(),
    [...REVIEW_ROLES],
    "all documentary review roles are required",
  );
  const reviewers = new Set();
  for (const decision of envelope.review.decisions) {
    assert.equal(decision.decision, "approved");
    assert.notEqual(
      decision.reviewerId,
      envelope.review.requesterId,
      "requester cannot self-approve",
    );
    reviewers.add(decision.reviewerId);
  }
  assert.equal(reviewers.size, REVIEW_ROLES.length, "reviewers must be split");
  assert.equal(envelope.review.authorization, "documentary-only");
  return envelope;
}

export function assertStagingApplyReady(envelope, options) {
  assertDocumentaryApprovalReady(envelope, options);
  for (const id of LIVE_GATES) {
    const gate = envelope.statement.preflight.find((entry) => entry.id === id);
    assert.equal(gate.status, "verified-live", `${id} is not live-verified`);
    assert.match(gate.evidenceSha256, SHA256);
  }
  const authorization = envelope.applyAuthorization;
  assert.equal(
    authorization.decision,
    "authorize-staging-apply",
    "separate staging apply authorization is required",
  );
  assert.match(authorization.reviewerId, PRINCIPAL);
  assert.ok(
    authorization.reviewerId !== envelope.review.requesterId &&
      envelope.review.decisions.every(
        (decision) => decision.reviewerId !== authorization.reviewerId,
      ),
    "apply authorizer must be independent",
  );
  parseInstant(authorization.reviewedAt, "apply authorization review time");
  return envelope;
}

export function stagingApprovalScopeSha256(statement) {
  return sha256(canonicalJson(statement));
}

export function stagingPlanSummarySha256(plan) {
  const summary = { ...plan };
  delete summary.redactedSummarySha256;
  return sha256(canonicalJson(summary));
}

function validateFixture(fixture) {
  assert.equal(fixture.environment, "staging");
  assert.match(fixture.accountId, ACCOUNT);
  assert.equal(fixture.region, "ca-central-1");
  assert.match(fixture.sourceRevision, COMMIT);
  assert.match(fixture.releaseSetSha256, SHA256);
  assert.ok(Array.isArray(fixture.artifacts));
  assert.deepEqual(
    fixture.costServiceInputs.map((entry) => entry.service).sort(),
    [...COST_SERVICES],
  );
}

function validateRelease(release, accountId) {
  assertExactKeys(release, ["artifacts", "releaseSetSha256", "sourceRevision"]);
  assert.match(release.sourceRevision, COMMIT);
  assert.match(release.releaseSetSha256, SHA256);
  assert.deepEqual(
    release.artifacts.map((artifact) => artifact.name),
    ["application", "feedback-worker"],
  );
  for (const artifact of release.artifacts) {
    assertExactKeys(artifact, ["name", "rollbackPredecessor", "subject"]);
    const repository =
      artifact.name === "application"
        ? "astroligyapp"
        : "astroligyapp-feedback-worker";
    const prefix = `${accountId}.dkr.ecr.ca-central-1.amazonaws.com/${repository}@`;
    assert.match(
      artifact.subject,
      new RegExp(`^${escapeRegExp(prefix)}sha256:[a-f0-9]{64}$`, "u"),
      `${artifact.name} subject is not immutable or account-bound`,
    );
    assert.match(
      artifact.rollbackPredecessor,
      new RegExp(`^${escapeRegExp(prefix)}sha256:[a-f0-9]{64}$`, "u"),
      `${artifact.name} rollback is not immutable or account-bound`,
    );
    assert.notEqual(
      artifact.subject,
      artifact.rollbackPredecessor,
      "rollback must select a predecessor",
    );
  }
  assert.notEqual(
    release.artifacts[0].subject,
    release.artifacts[1].subject,
    "artifact subjects must be distinct",
  );
}

function validatePlan(plan, statement) {
  assertExactKeys(plan, [
    "accountId",
    "capacity",
    "changeCounts",
    "environment",
    "evidenceClass",
    "redactedSummarySha256",
    "region",
    "releaseSetSha256",
    "resourceCounts",
    "retention",
    "savedPlanSha256",
    "securityContract",
    "sourceRevision",
  ]);
  assert.ok(
    ["mock-contract-only", "saved-plan-reviewed"].includes(plan.evidenceClass),
  );
  assert.equal(plan.environment, statement.target.environment);
  assert.equal(plan.accountId, statement.target.accountId);
  assert.equal(plan.region, statement.target.region);
  assert.equal(plan.sourceRevision, statement.release.sourceRevision);
  assert.equal(plan.releaseSetSha256, statement.release.releaseSetSha256);
  assert.equal(
    plan.redactedSummarySha256,
    stagingPlanSummarySha256(plan),
    "redacted plan summary digest mismatch",
  );
  if (plan.evidenceClass === "mock-contract-only") {
    assert.equal(plan.savedPlanSha256, null);
    assert.equal(plan.changeCounts, null);
  } else {
    assert.match(plan.savedPlanSha256, SHA256);
    assertChangeCounts(plan.changeCounts);
  }
  assertNonNegativeIntegerMap(plan.resourceCounts, "resource counts");
  assertNonNegativeIntegerMap(plan.capacity, "capacity");
  assertNonNegativeIntegerMap(plan.retention, "retention");
  assert.deepEqual(plan.securityContract, {
    publicIndexingEnabled: false,
    applicationPublicIp: false,
    workerPublicIp: false,
    databasePublic: false,
    immutableRepositories: true,
    encryptedDatabase: true,
    deletionProtection: true,
    readOnlyRootFilesystems: true,
  });
}

function validateCostReview(cost, generatedAt) {
  assertExactKeys(cost, [
    "anomalyThreshold",
    "assumptionsSha256",
    "calculatorExportSha256",
    "currency",
    "estimateCreatedAt",
    "monthlyBudget",
    "monthlyEstimate",
    "serviceInputs",
    "status",
  ]);
  assert.equal(cost.currency, "USD");
  assert.deepEqual(
    cost.serviceInputs.map((entry) => entry.service),
    [...COST_SERVICES],
  );
  for (const entry of cost.serviceInputs) {
    assertExactKeys(entry, ["assumptions", "service"]);
    assert.ok(entry.assumptions.length > 0);
    for (const assumption of entry.assumptions) {
      assert.equal(typeof assumption, "string");
      assert.ok(assumption.length > 0 && assumption.length <= 200);
    }
  }
  assert.equal(
    cost.assumptionsSha256,
    sha256(canonicalJson(cost.serviceInputs)),
    "cost assumptions digest mismatch",
  );
  if (cost.status === "calculator-required") {
    for (const value of [
      cost.estimateCreatedAt,
      cost.calculatorExportSha256,
      cost.monthlyEstimate,
      cost.monthlyBudget,
      cost.anomalyThreshold,
    ])
      assert.equal(value, null, "unreviewed cost evidence must remain empty");
    return;
  }
  assert.equal(cost.status, "calculator-reviewed");
  const estimateCreatedAt = parseInstant(
    cost.estimateCreatedAt,
    "calculator estimate time",
  );
  assert.ok(
    generatedAt - estimateCreatedAt <= MAX_COST_AGE_MS &&
      estimateCreatedAt <= generatedAt,
    "calculator estimate is stale or from the future",
  );
  assert.match(cost.calculatorExportSha256, SHA256);
  assertPositiveMoney(cost.monthlyEstimate, "monthly estimate");
  assertPositiveMoney(cost.monthlyBudget, "monthly budget");
  assertPositiveMoney(cost.anomalyThreshold, "anomaly threshold");
  assert.ok(
    cost.monthlyEstimate <= cost.monthlyBudget,
    "estimate exceeds budget",
  );
  assert.ok(
    cost.anomalyThreshold <= cost.monthlyBudget,
    "anomaly threshold exceeds budget",
  );
}

function validateChangeWindow(window, generatedAt, validUntil) {
  assertExactKeys(window, ["end", "start", "timezone"]);
  assert.equal(window.timezone, "UTC");
  const start = parseInstant(window.start, "change window start");
  const end = parseInstant(window.end, "change window end");
  assert.ok(start >= generatedAt, "change window predates package");
  assert.ok(end > start, "change window must move forward");
  assert.ok(
    end - start <= MAX_CHANGE_WINDOW_MS,
    "change window exceeds four hours",
  );
  assert.ok(end <= validUntil, "change window exceeds approval validity");
}

function validateOwners(owners) {
  assertExactKeys(owners, ["cost", "release", "rollback", "security"]);
  for (const owner of Object.values(owners)) assert.match(owner, PRINCIPAL);
  assert.notEqual(
    owners.release,
    owners.security,
    "release and security owners must differ",
  );
}

function validateRecovery(recovery) {
  assertExactKeys(recovery, [
    "backupRetentionDays",
    "restoreTestFrequencyDays",
    "rpoMinutes",
    "rtoMinutes",
  ]);
  assertIntegerBetween(recovery.rpoMinutes, 1, 1_440, "RPO");
  assertIntegerBetween(recovery.rtoMinutes, 1, 480, "RTO");
  assertIntegerBetween(recovery.backupRetentionDays, 7, 35, "backup retention");
  assertIntegerBetween(
    recovery.restoreTestFrequencyDays,
    1,
    90,
    "restore-test frequency",
  );
}

function validatePreflight(preflight) {
  const expectedIds = [...DOCUMENT_GATES, ...LIVE_GATES].sort();
  assert.deepEqual(
    preflight.map((entry) => entry.id).sort(),
    expectedIds,
    "preflight gate inventory drifted",
  );
  assert.equal(
    new Set(preflight.map((entry) => entry.id)).size,
    expectedIds.length,
  );
  for (const gate of preflight) {
    assertExactKeys(gate, ["evidenceClass", "evidenceSha256", "id", "status"]);
    const isLive = LIVE_GATES.includes(gate.id);
    assert.equal(
      gate.evidenceClass,
      isLive ? "live-environment" : "local-documentary",
    );
    assert.ok(
      isLive
        ? ["pending-external", "verified-live"].includes(gate.status)
        : ["pending-external", "verified-local"].includes(gate.status),
      `${gate.id} has an invalid status`,
    );
    if (gate.status === "pending-external")
      assert.equal(gate.evidenceSha256, null);
    else assert.match(gate.evidenceSha256, SHA256);
  }
}

function validateReview(review, scopeSha256, generatedAt, validUntil, now) {
  assertExactKeys(review, [
    "authorization",
    "decisions",
    "requesterId",
    "scopeSha256",
  ]);
  assert.equal(review.authorization, "documentary-only");
  assert.match(review.requesterId, PRINCIPAL);
  assert.equal(review.scopeSha256, scopeSha256, "review scope was tampered");
  assert.ok(review.decisions.length <= REVIEW_ROLES.length);
  for (const decision of review.decisions) {
    assertExactKeys(decision, [
      "decision",
      "evidenceSha256",
      "reviewedAt",
      "reviewerId",
      "role",
      "scopeSha256",
    ]);
    assert.ok(REVIEW_ROLES.includes(decision.role));
    assert.equal(decision.decision, "approved");
    assert.match(decision.reviewerId, PRINCIPAL);
    assert.match(decision.evidenceSha256, SHA256);
    assert.equal(
      decision.scopeSha256,
      scopeSha256,
      "decision scope was tampered",
    );
    assertReviewTime(
      decision.reviewedAt,
      `${decision.role} review time`,
      generatedAt,
      validUntil,
      now,
    );
  }
  assert.equal(
    new Set(review.decisions.map((decision) => decision.role)).size,
    review.decisions.length,
    "duplicate review role",
  );
}

function validateApplyAuthorization(
  authorization,
  scopeSha256,
  generatedAt,
  validUntil,
  now,
) {
  assertExactKeys(authorization, [
    "decision",
    "evidenceSha256",
    "reviewedAt",
    "reviewerId",
    "scopeSha256",
  ]);
  assert.equal(
    authorization.scopeSha256,
    scopeSha256,
    "apply scope was tampered",
  );
  if (authorization.decision === "not-authorized") {
    assert.equal(authorization.evidenceSha256, null);
    assert.equal(authorization.reviewerId, null);
    assert.equal(authorization.reviewedAt, null);
    return;
  }
  assert.equal(authorization.decision, "authorize-staging-apply");
  assert.match(authorization.evidenceSha256, SHA256);
  assert.match(authorization.reviewerId, PRINCIPAL);
  assertReviewTime(
    authorization.reviewedAt,
    "apply authorization review time",
    generatedAt,
    validUntil,
    now,
  );
}

function assertNoSensitiveOrContactMaterial(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(
    serialized,
    /(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|password|passphrase|secret.value|receipt.?handle)/iu,
    "approval evidence includes secret-like material",
  );
  assert.doesNotMatch(
    serialized,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
    "approval evidence includes a contact address",
  );
}

function assertChangeCounts(counts) {
  assertExactKeys(counts, ["create", "delete", "replace", "update"]);
  assertNonNegativeIntegerMap(counts, "change counts");
  assert.equal(
    counts.delete,
    0,
    "destructive plan changes require a separate process",
  );
  assert.equal(
    counts.replace,
    0,
    "replacement plan changes require a separate process",
  );
}

function assertNonNegativeIntegerMap(value, description) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.ok(Object.keys(value).length > 0, `${description} are required`);
  for (const [name, count] of Object.entries(value)) {
    assert.match(name, /^[a-z][a-zA-Z0-9]*$/u);
    assert.ok(
      Number.isSafeInteger(count) && count >= 0,
      `invalid ${description}: ${name}`,
    );
  }
}

function assertPositiveMoney(value, description) {
  assert.ok(
    Number.isSafeInteger(value) && value > 0,
    `${description} must use positive integer cents`,
  );
}

function assertIntegerBetween(value, minimum, maximum, description) {
  assert.ok(
    Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    `${description} is outside the accepted staging range`,
  );
}

function parseInstant(value, description) {
  assert.equal(typeof value, "string", `${description} must be an ISO instant`);
  const parsed = new Date(value);
  assert.ok(Number.isFinite(parsed.getTime()), `${description} is invalid`);
  assert.equal(
    parsed.toISOString(),
    value,
    `${description} must be canonical UTC`,
  );
  return parsed.getTime();
}

function assertReviewTime(value, description, generatedAt, validUntil, now) {
  const reviewedAt = parseInstant(value, description);
  assert.ok(reviewedAt >= generatedAt, `${description} predates the package`);
  assert.ok(
    reviewedAt <= validUntil,
    `${description} exceeds package validity`,
  );
  assert.ok(reviewedAt <= now, `${description} is from the future`);
}

function assertExactKeys(value, expected) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    "fields drifted",
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
