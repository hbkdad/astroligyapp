import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { canonicalJson, sha256 } from "./artifact-manifest.mjs";

const NODE_MODULES = "node_modules/";

export function createWorkerSpdx(input) {
  assert.match(input.commit, /^[a-f0-9]{40}$/u, "invalid source commit");
  assert.match(input.created, /^\d{4}-\d{2}-\d{2}T/u, "invalid creation time");
  assert.equal(input.metafile?.outputs instanceof Object, true);
  assert.equal(
    input.lockfile?.lockfileVersion,
    3,
    "npm lockfile v3 is required",
  );
  assert.equal(input.packageManifest?.license, "UNLICENSED");
  assert.match(input.bundleSha256, /^sha256:[a-f0-9]{64}$/u);

  const packages = new Map();
  const localInputs = [];
  for (const path of Object.keys(input.metafile.inputs).sort()) {
    if (!path.includes(NODE_MODULES)) {
      if (path !== "server-only-marker:server-only") localInputs.push(path);
      continue;
    }
    const lockPath = packageLockPath(path);
    const locked = input.lockfile.packages[lockPath];
    assert.ok(
      locked,
      `bundled input is absent from package-lock.json: ${path}`,
    );
    assert.match(
      locked.version,
      /^\d+\.\d+\.\d+/u,
      `invalid version: ${lockPath}`,
    );
    assert.match(
      locked.resolved,
      /^https:\/\/registry\.npmjs\.org\//u,
      `invalid package source: ${lockPath}`,
    );
    assert.match(
      locked.integrity,
      /^sha512-[A-Za-z0-9+/]+={0,2}$/u,
      `invalid package integrity: ${lockPath}`,
    );
    assert.match(
      locked.license,
      /^(Apache-2\.0|ISC|MIT)$/u,
      `unreviewed worker package license: ${lockPath}`,
    );
    const current = packages.get(lockPath) ?? { locked, inputs: [] };
    current.inputs.push(path);
    packages.set(lockPath, current);
  }
  assert.ok(localInputs.length > 0, "worker bundle has no application inputs");
  assert.ok(packages.size > 0, "worker bundle has no locked dependencies");

  const rootId = "SPDXRef-Package-feedback-worker";
  const dependencyPackages = [...packages.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([lockPath, evidence]) => {
      const name = packageName(lockPath);
      const id = `SPDXRef-Package-${createHash("sha256").update(lockPath).digest("hex").slice(0, 20)}`;
      return {
        SPDXID: id,
        name,
        versionInfo: evidence.locked.version,
        downloadLocation: evidence.locked.resolved,
        filesAnalyzed: false,
        licenseConcluded: evidence.locked.license,
        licenseDeclared: evidence.locked.license,
        copyrightText: "NOASSERTION",
        checksums: [
          {
            algorithm: "SHA512",
            checksumValue: Buffer.from(
              evidence.locked.integrity.slice("sha512-".length),
              "base64",
            ).toString("hex"),
          },
        ],
        externalRefs: [
          {
            referenceCategory: "PACKAGE-MANAGER",
            referenceType: "purl",
            referenceLocator: npmPurl(name, evidence.locked.version),
          },
        ],
        comment: `Exact npm lock path ${lockPath}; ${evidence.inputs.length} bundled input files.`,
      };
    });
  const document = {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `astroligyapp-feedback-worker-${input.bundleSha256.slice(7, 19)}`,
    documentNamespace: `https://github.com/hbkdad/astroligyapp/sbom/${input.commit}/feedback-worker/${input.bundleSha256.slice(7)}`,
    creationInfo: {
      created: input.created,
      creators: ["Tool: astroligyapp-worker-sbom/1.0.0"],
    },
    hasExtractedLicensingInfos: [
      {
        licenseId: "LicenseRef-Proprietary",
        extractedText:
          "Copyright and licensing terms are reserved by the project owner; redistribution is not granted by this SBOM.",
        name: "Astroligyapp proprietary application code",
      },
    ],
    packages: [
      {
        SPDXID: rootId,
        name: input.packageManifest.name,
        versionInfo: input.packageManifest.version,
        downloadLocation: "NOASSERTION",
        filesAnalyzed: false,
        licenseConcluded: "LicenseRef-Proprietary",
        licenseDeclared: "LicenseRef-Proprietary",
        copyrightText: "NOASSERTION",
        checksums: [
          {
            algorithm: "SHA256",
            checksumValue: input.bundleSha256.slice(7),
          },
        ],
        comment: `${localInputs.length} application source inputs; runtime bundle only.`,
      },
      ...dependencyPackages,
    ],
    relationships: [
      {
        spdxElementId: "SPDXRef-DOCUMENT",
        relationshipType: "DESCRIBES",
        relatedSpdxElement: rootId,
      },
      ...dependencyPackages.map((package_) => ({
        spdxElementId: rootId,
        relationshipType: "DEPENDS_ON",
        relatedSpdxElement: package_.SPDXID,
      })),
    ],
  };
  return Object.freeze({
    document,
    json: canonicalJson(document),
    packageCount: document.packages.length,
    dependencyCount: dependencyPackages.length,
    bundledInputCount: Object.keys(input.metafile.inputs).length,
    sha256: sha256(canonicalJson(document)),
  });
}

function packageLockPath(path) {
  const marker = path.lastIndexOf(NODE_MODULES);
  assert.ok(marker >= 0);
  const prefix = path.slice(0, marker + NODE_MODULES.length);
  const parts = path.slice(marker + NODE_MODULES.length).split("/");
  const nameParts = parts[0].startsWith("@")
    ? parts.slice(0, 2)
    : parts.slice(0, 1);
  assert.equal(nameParts.length, parts[0].startsWith("@") ? 2 : 1);
  return `${prefix}${nameParts.join("/")}`;
}

function packageName(lockPath) {
  const marker = lockPath.lastIndexOf(NODE_MODULES);
  return lockPath.slice(marker + NODE_MODULES.length);
}

function npmPurl(name, version) {
  const encodedName = name.startsWith("@")
    ? `%40${name.slice(1).split("/").map(encodeURIComponent).join("/")}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${version}`;
}
