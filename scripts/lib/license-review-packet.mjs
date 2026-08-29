import assert from "node:assert/strict";

import { canonicalJson, sha256 } from "./artifact-manifest.mjs";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const MAX_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;
const REVIEW_REQUIREMENTS = {
  roles: [
    "evidence-preparer",
    "independent-license-reviewer",
    "release-authorizer",
  ],
  separation: "three-distinct-accountable-humans",
  reReviewTriggers: [
    "dependency-identity-version-source-or-integrity-change",
    "license-expression-or-authoritative-text-change",
    "policy-material-evidence-or-notice-hash-change",
    "source-commit-or-distribution-model-change",
    "packet-expiry",
  ],
};

export function createLicenseReviewPacket({
  releaseSet,
  evidenceByArtifact,
  createdAt,
  validUntil,
}) {
  const source = releaseSet.statement.source;
  const artifacts = releaseSet.statement.artifacts
    .map((artifact) => {
      const evidence = evidenceByArtifact[artifact.name];
      assert.ok(evidence, `missing license evidence: ${artifact.name}`);
      assert.equal(evidence.artifact, artifact.name);
      assert.equal(
        sha256(canonicalJson(evidence)),
        artifact.licenses.evidenceSha256,
      );
      const records = evidence.packages
        .filter((package_) => package_.decision.outcome === "manual-review")
        .map((package_) => ({
          spdxId: package_.spdxId,
          name: package_.name,
          observedVersion: package_.observedVersion,
          licenseExpression: package_.licenseExpression,
          category: reviewCategory(package_),
          reason: package_.decision.reason,
          packageSource: package_.source,
          packageIntegrity: package_.integrity,
          licenseTextSha256: package_.licenseText?.sha256 ?? null,
        }))
        .sort((left, right) => left.spdxId.localeCompare(right.spdxId));
      assert.equal(records.length, artifact.licenses.manualReviewCount);
      return {
        name: artifact.name,
        policySha256: artifact.licenses.policySha256,
        materialsVersion: artifact.licenses.materialsVersion,
        materialsSha256: artifact.licenses.materialsSha256,
        evidenceSha256: artifact.licenses.evidenceSha256,
        noticeSha256: artifact.licenses.noticeSha256,
        unresolvedCount: artifact.licenses.unresolvedCount,
        manualReviewCount: records.length,
        records,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const statement = {
    source: {
      repository: source.repository,
      commit: source.commit,
      tree: source.tree,
    },
    releaseSetSha256: sha256(canonicalJson(releaseSet)),
    reviewRequirements: REVIEW_REQUIREMENTS,
    artifacts,
  };
  return {
    schemaVersion: 1,
    kind: "astroligyapp.license-review-packet",
    trust: "review-input-only",
    createdAt,
    validUntil,
    statement,
    scopeSha256: sha256(canonicalJson(statement)),
    review: {
      status: "not-requested",
      decisions: [],
      authorizationGranted: false,
    },
  };
}

export function validateLicenseReviewPacket(
  packet,
  { releaseSet, evidenceByArtifact, now = packet.createdAt },
) {
  assertExactKeys(packet, [
    "createdAt",
    "kind",
    "review",
    "schemaVersion",
    "scopeSha256",
    "statement",
    "trust",
    "validUntil",
  ]);
  assert.equal(packet.schemaVersion, 1);
  assert.equal(packet.kind, "astroligyapp.license-review-packet");
  assert.equal(packet.trust, "review-input-only");
  const created = parseInstant(packet.createdAt, "createdAt");
  const validUntil = parseInstant(packet.validUntil, "validUntil");
  const current = parseInstant(now, "now");
  assert.ok(validUntil > created, "review validity must move forward");
  assert.ok(
    validUntil - created <= MAX_VALIDITY_MS,
    "review validity exceeds 30 days",
  );
  assert.ok(current >= created, "review packet is from the future");
  assert.ok(current < validUntil, "review packet expired");
  assert.equal(
    packet.scopeSha256,
    sha256(canonicalJson(packet.statement)),
    "review scope mismatch",
  );
  assertExactKeys(packet.statement, [
    "artifacts",
    "releaseSetSha256",
    "reviewRequirements",
    "source",
  ]);
  assert.deepEqual(packet.statement.reviewRequirements, REVIEW_REQUIREMENTS);
  assert.deepEqual(packet.review, {
    status: "not-requested",
    decisions: [],
    authorizationGranted: false,
  });

  const source = releaseSet.statement.source;
  assert.deepEqual(packet.statement.source, {
    repository: source.repository,
    commit: source.commit,
    tree: source.tree,
  });
  assert.match(source.commit, COMMIT);
  assert.equal(
    packet.statement.releaseSetSha256,
    sha256(canonicalJson(releaseSet)),
  );
  const expectedArtifacts = releaseSet.statement.artifacts
    .map((artifact) => artifact.name)
    .sort();
  assert.deepEqual(
    packet.statement.artifacts.map((artifact) => artifact.name),
    expectedArtifacts,
  );

  for (const scoped of packet.statement.artifacts) {
    const artifact = releaseSet.statement.artifacts.find(
      (candidate) => candidate.name === scoped.name,
    );
    const evidence = evidenceByArtifact[scoped.name];
    assert.ok(artifact && evidence);
    assert.equal(evidence.artifact, scoped.name);
    assert.equal(
      sha256(canonicalJson(evidence)),
      artifact.licenses.evidenceSha256,
    );
    assert.deepEqual(
      {
        policySha256: scoped.policySha256,
        materialsVersion: scoped.materialsVersion,
        materialsSha256: scoped.materialsSha256,
        evidenceSha256: scoped.evidenceSha256,
        noticeSha256: scoped.noticeSha256,
        unresolvedCount: scoped.unresolvedCount,
      },
      {
        policySha256: artifact.licenses.policySha256,
        materialsVersion: artifact.licenses.materialsVersion,
        materialsSha256: artifact.licenses.materialsSha256,
        evidenceSha256: artifact.licenses.evidenceSha256,
        noticeSha256: artifact.licenses.noticeSha256,
        unresolvedCount: artifact.licenses.unresolvedCount,
      },
    );
    for (const digest of [
      scoped.policySha256,
      scoped.materialsSha256,
      scoped.evidenceSha256,
      scoped.noticeSha256,
    ])
      assert.match(digest, SHA256);
    const manual = evidence.packages
      .filter((package_) => package_.decision.outcome === "manual-review")
      .sort((left, right) => left.spdxId.localeCompare(right.spdxId));
    assert.equal(scoped.manualReviewCount, manual.length);
    assert.equal(scoped.records.length, manual.length);
    assert.deepEqual(
      scoped.records,
      manual.map((package_) => ({
        spdxId: package_.spdxId,
        name: package_.name,
        observedVersion: package_.observedVersion,
        licenseExpression: package_.licenseExpression,
        category: reviewCategory(package_),
        reason: package_.decision.reason,
        packageSource: package_.source,
        packageIntegrity: package_.integrity,
        licenseTextSha256: package_.licenseText?.sha256 ?? null,
      })),
    );
  }
  assertNoSensitiveMaterial(packet);
  return packet;
}

export function assertLicenseReviewAuthorizesRedistribution(packet, options) {
  validateLicenseReviewPacket(packet, options);
  assert.fail("a review-input packet cannot authorize redistribution");
}

function reviewCategory(package_) {
  const reason = package_.decision.reason;
  if (reason === "missing or unparseable license assertion")
    return "missing-assertion";
  if (reason === "authoritative license text is unavailable")
    return "missing-authoritative-text";
  if (reason === "custom license reference") return "custom-or-composite-terms";
  if (reason === "identifier is outside the automatic policy")
    return "review-only-expression";
  assert.fail(`unexpected manual-review reason: ${reason}`);
}

function assertNoSensitiveMaterial(value) {
  const text = canonicalJson(value);
  assert.doesNotMatch(
    text,
    /(private.?key|client.?secret|access.?key|session.?token|authorization: bearer|@example\.)/iu,
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
