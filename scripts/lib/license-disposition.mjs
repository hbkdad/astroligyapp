import assert from "node:assert/strict";

import { canonicalJson, sha256 } from "./artifact-manifest.mjs";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const ACTOR = /^actor_[a-f0-9]{24}$/u;
const REQUIRED_TRIGGERS = [
  "dependency-change",
  "distribution-model-change",
  "evidence-change",
  "policy-change",
];

export function emptyDispositionSummary(manualReviewCount) {
  assert.ok(Number.isSafeInteger(manualReviewCount) && manualReviewCount >= 0);
  return Object.freeze({
    trust: "none",
    ledgerSha256: null,
    dispositionCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    needsRemediationCount: 0,
    undisposedCount: manualReviewCount,
  });
}

export function validateAndSummarizeDispositionLedger({
  ledger,
  releaseSet,
  evidenceByArtifact,
  now,
}) {
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.kind, "astroligyapp.license-disposition-ledger");
  assert.ok(
    ["synthetic-fixture-only", "accountable-human"].includes(ledger.trust),
    "invalid ledger trust",
  );
  assert.match(
    ledger.ledgerId,
    ledger.trust === "synthetic-fixture-only"
      ? /^synthetic_[a-f0-9]{24}$/u
      : /^ledger_[a-f0-9]{24}$/u,
  );
  assert.match(ledger.preparedBy, ACTOR);
  assert.match(ledger.reviewedBy, ACTOR);
  assert.notEqual(
    ledger.preparedBy,
    ledger.reviewedBy,
    "reviewer must be independent",
  );
  assert.deepEqual([...ledger.reviewTriggers].sort(), REQUIRED_TRIGGERS);
  const reviewedAt = parseTime(ledger.reviewedAt, "reviewedAt");
  const expiresAt = parseTime(ledger.expiresAt, "expiresAt");
  const current = parseTime(now, "now");
  assert.ok(reviewedAt < expiresAt, "ledger expiry must follow review");
  assert.ok(current >= reviewedAt, "ledger review is in the future");
  assert.ok(current < expiresAt, "ledger has expired");
  assert.equal(ledger.scope.repository, releaseSet.statement.source.repository);
  assert.equal(ledger.scope.commit, releaseSet.statement.source.commit);
  assert.deepEqual(Object.keys(ledger.scope.artifacts).sort(), [
    "application",
    "feedback-worker",
  ]);

  const summaries = {};
  for (const artifact of releaseSet.statement.artifacts) {
    const evidence = evidenceByArtifact[artifact.name];
    assert.ok(evidence, `missing evidence: ${artifact.name}`);
    assert.equal(
      evidence.artifact,
      artifact.name,
      "evidence artifact scope drifted",
    );
    const scoped = ledger.scope.artifacts[artifact.name];
    assert.equal(scoped.policySha256, artifact.licenses.policySha256);
    assert.equal(scoped.evidenceSha256, artifact.licenses.evidenceSha256);
    assert.equal(evidence.policySha256, scoped.policySha256);
    assert.equal(sha256(canonicalJson(evidence)), scoped.evidenceSha256);
    const manual = evidence.packages.filter(
      (package_) => package_.decision.outcome === "manual-review",
    );
    assert.equal(manual.length, artifact.licenses.manualReviewCount);
    const entries = ledger.dispositions.filter(
      (entry) => entry.artifact === artifact.name,
    );
    const byId = new Map(entries.map((entry) => [entry.spdxId, entry]));
    assert.equal(byId.size, entries.length, "duplicate disposition");
    for (const package_ of manual) {
      const entry = byId.get(package_.spdxId);
      assert.ok(entry, `manual package is undisposed: ${package_.spdxId}`);
      assert.equal(entry.licenseExpression, package_.licenseExpression);
      assert.equal(entry.packageSource, package_.source);
      assert.equal(entry.packageIntegrity, package_.integrity);
      assert.equal(
        entry.licenseTextSha256,
        package_.licenseText?.sha256 ?? null,
      );
      if (ledger.trust === "synthetic-fixture-only") {
        assert.match(
          entry.evidenceSource,
          /^urn:synthetic:license-review:[a-f0-9]{24}$/u,
        );
        assert.match(entry.noteRef, /^synthetic-note-[a-f0-9]{12}$/u);
      } else {
        assert.match(
          entry.evidenceSource,
          /^https:\/\/[a-z0-9.-]+\/[a-zA-Z0-9/_-]*[a-f0-9]{64}$/u,
        );
        assert.match(entry.noteRef, /^review-note-[a-f0-9]{24}$/u);
      }
      assert.ok(
        ["approved", "rejected", "needs-remediation"].includes(entry.outcome),
        "invalid disposition outcome",
      );
    }
    assert.equal(
      entries.length,
      manual.length,
      "disposition scope has extra packages",
    );
    summaries[artifact.name] = Object.freeze({
      trust: ledger.trust,
      ledgerSha256: sha256(canonicalJson(ledger)),
      dispositionCount: entries.length,
      approvedCount: entries.filter((entry) => entry.outcome === "approved")
        .length,
      rejectedCount: entries.filter((entry) => entry.outcome === "rejected")
        .length,
      needsRemediationCount: entries.filter(
        (entry) => entry.outcome === "needs-remediation",
      ).length,
      undisposedCount: manual.length - entries.length,
    });
  }
  return Object.freeze(summaries);
}

export function applyDispositionLedger(input) {
  const summaries = validateAndSummarizeDispositionLedger(input);
  const result = structuredClone(input.releaseSet);
  for (const artifact of result.statement.artifacts)
    artifact.licenseDispositions = summaries[artifact.name];
  return result;
}

export function validateDispositionSummary(summary, manualReviewCount) {
  assert.ok(
    ["none", "synthetic-fixture-only", "accountable-human"].includes(
      summary.trust,
    ),
  );
  assert.ok(summary.ledgerSha256 === null || SHA256.test(summary.ledgerSha256));
  for (const field of [
    "dispositionCount",
    "approvedCount",
    "rejectedCount",
    "needsRemediationCount",
    "undisposedCount",
  ])
    assert.ok(Number.isSafeInteger(summary[field]) && summary[field] >= 0);
  assert.equal(
    summary.dispositionCount,
    summary.approvedCount +
      summary.rejectedCount +
      summary.needsRemediationCount,
  );
  assert.equal(
    summary.dispositionCount + summary.undisposedCount,
    manualReviewCount,
  );
  if (summary.trust === "none") assert.equal(summary.ledgerSha256, null);
  else assert.match(summary.ledgerSha256, SHA256);
  return summary;
}

function parseTime(value, field) {
  assert.match(
    value,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u,
    `${field} must be canonical UTC`,
  );
  const time = Date.parse(value);
  assert.ok(Number.isSafeInteger(time), `invalid ${field}`);
  return time;
}
