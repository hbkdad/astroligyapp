import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { canonicalJson, sha256 } from "./artifact-manifest.mjs";

const SPDX_ID = /\b(?:[A-Za-z][A-Za-z0-9.-]*|LicenseRef-[A-Za-z0-9.-]+)\b/gu;
const OPERATORS = new Set(["AND", "OR", "WITH"]);
const TEXT_NAMES =
  /^(?:licen[cs]e|copying|notice|third-party-notices)(?:\..+)?$/iu;

export function concludeLicenseEvidence({
  artifact,
  spdx,
  policy,
  sourceRoot,
  lockfile,
  runtimeTexts = {},
  proprietaryText,
  reviewedMaterials = null,
}) {
  validatePolicy(policy);
  if (reviewedMaterials) validateReviewedMaterials(reviewedMaterials);
  assert.ok(Array.isArray(spdx.packages) && spdx.packages.length > 0);
  const packageRecords = spdx.packages.map((package_) => {
    const provenance = packageProvenance(package_, lockfile);
    const declared = normalizeExpression(
      isFirstParty(package_, artifact)
        ? "LicenseRef-Proprietary"
        : package_.licenseDeclared,
    );
    const material = findLicenseMaterial({
      package_,
      provenance,
      declared,
      sourceRoot,
      runtimeTexts,
      proprietaryText,
      reviewedMaterials,
    });
    const decision = decide({
      declared,
      material,
      policy,
      firstParty: isFirstParty(package_, artifact),
    });
    package_.licenseDeclared = declared;
    package_.licenseConcluded = declared;
    return {
      spdxId: package_.SPDXID,
      name: package_.name,
      observedVersion: package_.versionInfo ?? "UNKNOWN",
      identity: provenance.identity,
      source: provenance.source,
      integrity: provenance.integrity,
      licenseExpression: declared,
      licenseText: material
        ? {
            source: material.source,
            sha256: sha256(material.text),
            byteLength: Buffer.byteLength(material.text),
            text: material.text,
          }
        : null,
      decision,
    };
  });
  const counts = countDecisions(packageRecords);
  const materialsVersion = reviewedMaterials?.materialsVersion ?? null;
  const materialsSha256 = reviewedMaterials
    ? sha256(canonicalJson(reviewedMaterials))
    : null;
  const evidence = {
    schemaVersion: 2,
    kind: "astroligyapp.license-evidence",
    artifact,
    policyVersion: policy.policyVersion,
    policySha256: sha256(canonicalJson(policy)),
    materialsVersion,
    materialsSha256,
    counts,
    packages: packageRecords,
  };
  const notice = renderNotice(artifact, packageRecords);
  return Object.freeze({
    evidence,
    evidenceJson: canonicalJson(evidence),
    notice,
    summary: {
      ...counts,
      policyVersion: policy.policyVersion,
      policySha256: evidence.policySha256,
      materialsVersion,
      materialsSha256,
      evidenceSha256: sha256(canonicalJson(evidence)),
      noticeSha256: sha256(notice),
    },
  });
}

export function assertExternalRedistributionReady(summary) {
  validateSummary(summary);
  assert.equal(
    summary.unresolvedCount,
    0,
    "license assertions remain unresolved",
  );
  assert.equal(
    summary.manualReviewCount,
    0,
    "manual license review is required",
  );
  assert.equal(
    summary.prohibitedCount,
    0,
    "license policy prohibits redistribution",
  );
}

export function validateLicenseSummary(summary) {
  validateSummary(summary);
  return summary;
}

export function validateLicenseEvidenceBundle({
  evidence,
  notice,
  policy,
  reviewedMaterials = null,
  summary,
}) {
  validatePolicy(policy);
  if (reviewedMaterials) validateReviewedMaterials(reviewedMaterials);
  validateSummary(summary);
  assert.equal(evidence.schemaVersion, 2);
  assert.equal(evidence.kind, "astroligyapp.license-evidence");
  assert.equal(evidence.policyVersion, policy.policyVersion);
  assert.equal(evidence.policySha256, sha256(canonicalJson(policy)));
  assert.equal(
    evidence.materialsVersion,
    reviewedMaterials?.materialsVersion ?? null,
  );
  assert.equal(
    evidence.materialsSha256,
    reviewedMaterials ? sha256(canonicalJson(reviewedMaterials)) : null,
  );
  assert.deepEqual(evidence.counts, countDecisions(evidence.packages));
  for (const package_ of evidence.packages) {
    if (package_.licenseText)
      assert.equal(
        package_.licenseText.sha256,
        sha256(package_.licenseText.text),
        `license text drifted: ${package_.spdxId}`,
      );
  }
  assert.equal(summary.policySha256, sha256(canonicalJson(policy)));
  assert.equal(summary.materialsVersion, evidence.materialsVersion);
  assert.equal(summary.materialsSha256, evidence.materialsSha256);
  assert.equal(summary.evidenceSha256, sha256(canonicalJson(evidence)));
  assert.equal(summary.noticeSha256, sha256(notice));
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(evidence.counts).map((key) => [key, summary[key]]),
    ),
    evidence.counts,
  );
  return true;
}

function decide({ declared, material, policy, firstParty }) {
  if (firstParty)
    return {
      outcome: "first-party-proprietary",
      reason: "application code is governed separately",
    };
  const identifiers = expressionIds(declared);
  if (policy.missingAssertions.includes(declared) || identifiers.length === 0)
    return {
      outcome: "manual-review",
      reason: "missing or unparseable license assertion",
    };
  if (identifiers.some((id) => policy.prohibited.includes(id)))
    return { outcome: "prohibited", reason: "policy prohibited identifier" };
  if (
    identifiers.some((id) =>
      policy.manualReviewPrefixes.some((prefix) => id.startsWith(prefix)),
    )
  )
    return { outcome: "manual-review", reason: "custom license reference" };
  if (identifiers.some((id) => !policy.permittedWithNotice.includes(id)))
    return {
      outcome: "manual-review",
      reason: "identifier is outside the automatic policy",
    };
  if (!material)
    return {
      outcome: "manual-review",
      reason: "authoritative license text is unavailable",
    };
  return {
    outcome: "permitted-with-notice",
    reason: "recognized expression and traceable text",
  };
}

function packageProvenance(package_, lockfile) {
  const sourcePath = package_.sourceInfo?.match(/manifest file: (\S+)/u)?.[1];
  if (sourcePath?.startsWith("/app/node_modules/")) {
    const relativePath = sourcePath.slice("/app/".length);
    const compiled = relativePath.match(
      /^(node_modules\/next)\/dist\/compiled\/([^/]+)/u,
    );
    const lockPath = compiled?.[1] ?? packageRoot(relativePath);
    const locked = lockfile?.packages?.[lockPath];
    assert.ok(locked, `no npm lock evidence for ${sourcePath}`);
    assert.match(locked.resolved, /^https:\/\/registry\.npmjs\.org\//u);
    assert.match(locked.integrity, /^sha512-/u);
    const observed = package_.versionInfo;
    return {
      identity:
        compiled && [undefined, "UNKNOWN"].includes(observed)
          ? {
              kind: "next-compiled-component",
              enclosingPackage: `next@${locked.version}`,
              component: compiled[2],
            }
          : { kind: "npm-package", lockPath, version: locked.version },
      source: locked.resolved,
      integrity: locked.integrity,
    };
  }
  if (package_.sourceInfo?.includes("DPKG DB"))
    return {
      identity: { kind: "debian-package", version: package_.versionInfo },
      source: package_.sourceInfo,
      integrity:
        package_.packageVerificationCode?.packageVerificationCodeValue ?? null,
    };
  if (package_.name === "node")
    return {
      identity: { kind: "node-runtime", version: package_.versionInfo },
      source: package_.sourceInfo,
      integrity: package_.checksums?.[0]?.checksumValue ?? null,
    };
  return {
    identity: {
      kind: "oci-or-first-party",
      version: package_.versionInfo ?? "UNKNOWN",
    },
    source: package_.downloadLocation ?? "NOASSERTION",
    integrity: package_.checksums?.[0]?.checksumValue ?? null,
  };
}

function findLicenseMaterial({
  package_,
  sourceRoot,
  runtimeTexts,
  proprietaryText,
  provenance,
  declared,
  reviewedMaterials,
}) {
  if (
    isFirstParty(package_, "application") ||
    isFirstParty(package_, "feedback-worker")
  )
    return { source: "repository LICENSE", text: proprietaryText };
  if (runtimeTexts[package_.SPDXID]) return runtimeTexts[package_.SPDXID];
  const sourcePath = package_.sourceInfo?.match(/manifest file: (\S+)/u)?.[1];
  if (sourcePath?.startsWith("/app/")) {
    const localManifest = join(sourceRoot, sourcePath.slice("/app/".length));
    if (existsSync(localManifest)) {
      const directory = dirname(localManifest);
      const candidates = readdirSync(directory)
        .filter(
          (name) =>
            TEXT_NAMES.test(name) && statSync(join(directory, name)).isFile(),
        )
        .sort();
      if (candidates.length > 0) {
        const text = candidates
          .map(
            (name) =>
              `===== ${name} =====\n${readFileSync(join(directory, name), "utf8").trim()}\n`,
          )
          .join("\n");
        return {
          source: `installed ${relative(sourceRoot, directory).replaceAll("\\", "/")}/${candidates.join("+")}`,
          text,
        };
      }
    }
  }
  return findReviewedMaterial({
    package_,
    provenance,
    declared,
    sourceRoot,
    reviewedMaterials,
  });
}

function findReviewedMaterial({
  package_,
  provenance,
  declared,
  sourceRoot,
  reviewedMaterials,
}) {
  if (!reviewedMaterials) return null;
  const matches = reviewedMaterials.bindings.filter(
    (binding) =>
      binding.name === package_.name &&
      binding.version === (package_.versionInfo ?? "UNKNOWN") &&
      binding.licenseExpression === declared &&
      binding.artifactIntegrity === provenance.integrity,
  );
  assert.ok(
    matches.length <= 1,
    `ambiguous reviewed material: ${package_.name}`,
  );
  if (matches.length === 0) return null;
  const binding = matches[0];
  const descriptor = reviewedMaterials.materials[binding.material];
  assert.ok(descriptor, `missing reviewed material: ${binding.material}`);
  const absolute = join(sourceRoot, descriptor.path);
  const normalizedRoot = `${sourceRoot.replaceAll("\\", "/").replace(/\/$/u, "")}/`;
  assert.ok(
    absolute.replaceAll("\\", "/").startsWith(normalizedRoot),
    "reviewed material path escaped source root",
  );
  assert.ok(
    existsSync(absolute),
    `reviewed material file missing: ${descriptor.path}`,
  );
  const text = normalizeText(readFileSync(absolute, "utf8"));
  assert.equal(
    sha256(text),
    descriptor.sha256,
    `reviewed material hash drifted: ${binding.material}`,
  );
  return {
    source: `reviewed ${binding.authoritativeSource} (${reviewedMaterials.materialsVersion})`,
    text,
  };
}

function renderNotice(artifact, records) {
  const lines = [
    `THIRD-PARTY LICENSE EVIDENCE — ${artifact}`,
    "Generated deterministically. This inventory is not legal advice or a grant of rights.",
    "The proprietary application license is separate from third-party terms.",
    "",
  ];
  for (const record of records) {
    if (record.decision.outcome === "first-party-proprietary") continue;
    lines.push(
      `${record.name} (${record.observedVersion})`,
      `SPDX: ${record.licenseExpression}`,
      `Decision: ${record.decision.outcome} — ${record.decision.reason}`,
      `Source: ${record.source}`,
      `Integrity: ${record.integrity ?? "unavailable"}`,
      `License text: ${record.licenseText?.source ?? "UNAVAILABLE — MANUAL REVIEW REQUIRED"}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function isFirstParty(package_, artifact) {
  return (
    package_.name === "personal-cosmic-calendar" ||
    package_.name === "astroligyapp" ||
    package_.name === artifact
  );
}

function normalizeExpression(value) {
  if (typeof value !== "string" || value.trim() === "") return "NOASSERTION";
  return value.trim().replace(/\s+/gu, " ");
}

function expressionIds(expression) {
  return [...expression.matchAll(SPDX_ID)]
    .map(([id]) => id)
    .filter((id) => !OPERATORS.has(id));
}

function packageRoot(path) {
  const parts = path.split("/");
  const marker = parts.lastIndexOf("node_modules");
  const length = parts[marker + 1]?.startsWith("@") ? 3 : 2;
  return parts.slice(0, marker + length).join("/");
}

function countDecisions(records) {
  const counts = {
    packageCount: records.length,
    permittedWithNoticeCount: 0,
    manualReviewCount: 0,
    prohibitedCount: 0,
    firstPartyCount: 0,
    unresolvedCount: 0,
  };
  for (const { decision, licenseExpression } of records) {
    if (["NOASSERTION", "NONE", "UNKNOWN"].includes(licenseExpression))
      counts.unresolvedCount += 1;
    const key = {
      "permitted-with-notice": "permittedWithNoticeCount",
      "manual-review": "manualReviewCount",
      prohibited: "prohibitedCount",
      "first-party-proprietary": "firstPartyCount",
    }[decision.outcome];
    counts[key] += 1;
  }
  return counts;
}

function validatePolicy(policy) {
  assert.equal(policy.schemaVersion, 1);
  assert.match(policy.policyVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/u);
  for (const field of [
    "permittedWithNotice",
    "prohibited",
    "manualReviewPrefixes",
    "missingAssertions",
  ])
    assert.ok(Array.isArray(policy[field]));
}

function validateReviewedMaterials(materials) {
  assert.equal(materials.schemaVersion, 1);
  assert.match(materials.materialsVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/u);
  assert.ok(materials.materials && typeof materials.materials === "object");
  assert.ok(Array.isArray(materials.bindings));
  const identities = new Set();
  for (const [id, descriptor] of Object.entries(materials.materials)) {
    assert.match(id, /^[a-z0-9][a-z0-9.-]+$/u);
    assert.match(descriptor.path, /^(?:config|node_modules)\//u);
    assert.match(descriptor.sha256, /^sha256:[a-f0-9]{64}$/u);
  }
  for (const binding of materials.bindings) {
    assert.ok(materials.materials[binding.material]);
    assert.match(binding.version, /^(?:UNKNOWN|\d+\.\d+\.\d+)/u);
    assert.match(binding.artifactIntegrity, /^sha512-/u);
    assert.match(
      binding.authoritativeSource,
      /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//u,
    );
    const identity = `${binding.name}@${binding.version}|${binding.artifactIntegrity}`;
    assert.ok(
      !identities.has(identity),
      `duplicate reviewed material binding: ${identity}`,
    );
    identities.add(identity);
  }
}

function normalizeText(text) {
  return text.replace(/\r\n/gu, "\n");
}

function validateSummary(summary) {
  assert.match(summary.policyVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/u);
  if (summary.materialsVersion !== null)
    assert.match(summary.materialsVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/u);
  if (summary.materialsSha256 !== null)
    assert.match(summary.materialsSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(
    summary.materialsVersion === null,
    summary.materialsSha256 === null,
  );
  for (const field of ["policySha256", "evidenceSha256", "noticeSha256"])
    assert.match(summary[field], /^sha256:[a-f0-9]{64}$/u);
  for (const field of [
    "packageCount",
    "permittedWithNoticeCount",
    "manualReviewCount",
    "prohibitedCount",
    "firstPartyCount",
    "unresolvedCount",
  ])
    assert.ok(Number.isSafeInteger(summary[field]) && summary[field] >= 0);
  assert.equal(
    summary.packageCount,
    summary.permittedWithNoticeCount +
      summary.manualReviewCount +
      summary.prohibitedCount +
      summary.firstPartyCount,
  );
}
