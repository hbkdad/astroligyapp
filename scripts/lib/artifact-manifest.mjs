import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const TREE = /^[a-f0-9]{40}$/u;

export function validateArtifactManifest(manifest, expected = {}) {
  assert.equal(
    manifest.schemaVersion,
    1,
    "unsupported artifact manifest schema",
  );
  assert.equal(
    manifest.kind,
    "astroligyapp.release-evidence",
    "unexpected artifact manifest kind",
  );
  assert.match(manifest.source.commit, COMMIT, "invalid source commit");
  assert.match(manifest.source.tree, TREE, "invalid source tree");
  assert.match(
    manifest.source.dockerfileSha256,
    SHA256,
    "invalid Dockerfile digest",
  );
  assert.match(manifest.subject.imageId, SHA256, "invalid image ID");
  assert.equal(
    manifest.subject.platform,
    "linux/amd64",
    "unexpected image platform",
  );
  assert.equal(
    manifest.subject.reproducibleBuilds,
    2,
    "two independent builds are required",
  );
  assert.match(manifest.sbom.sha256, SHA256, "invalid SBOM digest");
  assert.equal(manifest.sbom.format, "SPDX-2.3", "unexpected SBOM format");
  assert.ok(
    Number.isInteger(manifest.sbom.packageCount) &&
      manifest.sbom.packageCount > 0,
    "SBOM must contain packages",
  );
  assert.ok(
    Number.isInteger(manifest.sbom.unresolvedLicenseCount) &&
      manifest.sbom.unresolvedLicenseCount >= 0,
    "invalid unresolved license count",
  );
  assert.equal(
    manifest.applicationLicense,
    "UNLICENSED",
    "application license declaration drifted",
  );
  assert.deepEqual(
    manifest.scans,
    { gitSecrets: "pass", imageSecrets: "pass", imageVulnerabilities: "pass" },
    "required scans did not pass",
  );
  assert.equal(manifest.signature, null, "local evidence must remain unsigned");
  assert.equal(
    manifest.attestation,
    null,
    "local evidence must not claim an attestation",
  );
  assert.deepEqual(
    Object.keys(manifest.tools).sort(),
    ["cosign", "gitleaks", "syft", "trivy"],
    "tool inventory drifted",
  );
  for (const reference of Object.values(manifest.tools))
    assert.match(
      reference,
      /@sha256:[a-f0-9]{64}$/u,
      "tool must be digest pinned",
    );
  assert.doesNotMatch(
    JSON.stringify(manifest),
    /(server.actions|encryption.key|passphrase|secret.value)/iu,
    "evidence includes forbidden secret material",
  );

  if (expected.commit)
    assert.equal(
      manifest.source.commit,
      expected.commit,
      "source commit mismatch",
    );
  if (expected.tree)
    assert.equal(manifest.source.tree, expected.tree, "source tree mismatch");
  if (expected.imageId)
    assert.equal(
      manifest.subject.imageId,
      expected.imageId,
      "image identity mismatch",
    );
  if (expected.sbomSha256)
    assert.equal(
      manifest.sbom.sha256,
      expected.sbomSha256,
      "SBOM identity mismatch",
    );
  return manifest;
}

export function assertImmutablePromotionReference(reference) {
  assert.match(
    reference,
    /^[a-z0-9][a-z0-9./_-]+@sha256:[a-f0-9]{64}$/u,
    "promotion reference must use an immutable sha256 digest",
  );
}

export function normalizeSpdx(sbom, { commit, created, imageId }) {
  assert.equal(sbom.spdxVersion, "SPDX-2.3", "Syft must produce SPDX 2.3");
  assert.ok(
    Array.isArray(sbom.packages) && sbom.packages.length > 0,
    "SPDX document contains no packages",
  );
  for (const package_ of sbom.packages) {
    assert.ok(
      "licenseDeclared" in package_,
      `package ${package_.name ?? "unknown"} has no license declaration`,
    );
    assert.ok(
      "licenseConcluded" in package_,
      `package ${package_.name ?? "unknown"} has no concluded license`,
    );
  }
  sbom.name = `astroligyapp-${imageId.slice(7, 19)}`;
  sbom.documentNamespace = `https://github.com/hbkdad/astroligyapp/sbom/${commit}/${imageId.slice(7)}`;
  sbom.creationInfo = { ...sbom.creationInfo, created };
  sbom.packages.sort((left, right) => left.SPDXID.localeCompare(right.SPDXID));
  sbom.relationships?.sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)),
  );
  return sortRecursively(sbom);
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortRecursively(value), null, 2)}\n`;
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortRecursively(value[key])]),
    );
  }
  return value;
}
