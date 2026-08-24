import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertImmutablePromotionReference,
  canonicalJson,
  normalizeSpdx,
  sha256,
  validateArtifactManifest,
} from "./lib/artifact-manifest.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = mkdtempSync(join(tmpdir(), "astroligyapp-artifact-"));
const sourceA = join(temporaryRoot, "source-a");
const sourceB = join(temporaryRoot, "source-b");
const archive = join(temporaryRoot, "source.tar");
const evidence = join(temporaryRoot, "evidence");
const secret = randomBytes(32).toString("base64");
const tools = {
  cosign:
    "ghcr.io/sigstore/cosign/cosign@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8",
  gitleaks:
    "ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f",
  syft: "anchore/syft@sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0",
  trivy:
    "aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969",
};
const tags = ["astroligyapp:goal82-a", "astroligyapp:goal82-b"];

try {
  assert.equal(
    capture("git", ["status", "--porcelain", "--untracked-files=no"]).trim(),
    "",
    "tracked worktree must be clean",
  );
  const commit = capture("git", ["rev-parse", "HEAD"]).trim();
  const tree = capture("git", ["rev-parse", "HEAD^{tree}"]).trim();
  const epoch = capture("git", ["show", "-s", "--format=%ct", "HEAD"]).trim();
  const created = new Date(Number(epoch) * 1000).toISOString();
  const deploymentId = `goal82-${commit.slice(0, 12)}`;
  const packageManifest = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  assert.equal(
    packageManifest.license,
    "UNLICENSED",
    "root package must explicitly declare its private license",
  );
  assert.match(
    readFileSync(join(root, "LICENSE"), "utf8"),
    /proprietary/iu,
    "root proprietary license notice is missing",
  );

  run("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"]);
  for (const source of [sourceA, sourceB]) {
    run("powershell", [
      "-NoProfile",
      "-Command",
      `New-Item -ItemType Directory -Path '${source.replaceAll("'", "''")}' | Out-Null; tar -xf '${archive.replaceAll("'", "''")}' -C '${source.replaceAll("'", "''")}'`,
    ]);
  }

  const archiveA = join(temporaryRoot, "artifact-a.oci.tar");
  const archiveB = join(temporaryRoot, "artifact-b.oci.tar");
  build(sourceA, tags[0], archiveA, {
    commit,
    epoch,
    created,
    deploymentId,
  });
  build(sourceB, tags[1], archiveB, {
    commit,
    epoch,
    created,
    deploymentId,
  });
  const imageA = inspect(tags[0]);
  const imageB = inspect(tags[1]);
  if (imageA.Id !== imageB.Id) {
    const layoutA = inspectOciArchive(archiveA, "a");
    const layoutB = inspectOciArchive(archiveB, "b");
    const layerDrift = compareOciLayers(layoutA, layoutB);
    throw new Error(
      `independent uncached builds produced different image IDs\n${JSON.stringify({ imageA: imageA.Id, imageB: imageB.Id, layoutA: summarizeLayout(layoutA), layoutB: summarizeLayout(layoutB), layerDrift }, null, 2)}`,
    );
  }
  assert.equal(
    imageA.Config.User,
    "node",
    "artifact must run as the node user",
  );
  assert.equal(
    imageA.Config.Labels["org.opencontainers.image.revision"],
    commit,
    "OCI source revision drifted",
  );
  assert.equal(
    imageA.Config.Labels["org.opencontainers.image.created"],
    created,
    "OCI source timestamp drifted",
  );
  assert.equal(
    imageA.Config.Labels["org.opencontainers.image.licenses"],
    "LicenseRef-Proprietary",
    "OCI license drifted",
  );

  run("docker", [
    "run",
    "--rm",
    "--volume",
    `${root}:/repo:ro`,
    tools.gitleaks,
    "git",
    "--source",
    "/repo",
    "--redact",
    "--no-banner",
    "--exit-code",
    "1",
  ]);
  run("docker", [
    "run",
    "--rm",
    "--volume",
    "/var/run/docker.sock:/var/run/docker.sock",
    tools.trivy,
    "image",
    "--scanners",
    "vuln,secret",
    "--severity",
    "HIGH,CRITICAL",
    "--exit-code",
    "1",
    "--quiet",
    tags[0],
  ]);

  run("powershell", [
    "-NoProfile",
    "-Command",
    `New-Item -ItemType Directory -Path '${evidence.replaceAll("'", "''")}' | Out-Null`,
  ]);
  run("docker", [
    "run",
    "--rm",
    "--volume",
    "/var/run/docker.sock:/var/run/docker.sock",
    "--volume",
    `${evidence}:/evidence`,
    tools.syft,
    tags[0],
    "--output",
    "spdx-json=/evidence/sbom.raw.json",
    "--quiet",
  ]);
  const normalized = normalizeSpdx(
    JSON.parse(readFileSync(join(evidence, "sbom.raw.json"), "utf8")),
    { commit, created, imageId: imageA.Id },
  );
  const sbomJson = canonicalJson(normalized);
  writeFileSync(join(evidence, "sbom.spdx.json"), sbomJson);
  const unresolvedLicenseCount = normalized.packages.filter(
    (package_) =>
      ["NOASSERTION", "NONE"].includes(package_.licenseDeclared) ||
      ["NOASSERTION", "NONE"].includes(package_.licenseConcluded),
  ).length;

  const manifest = {
    schemaVersion: 1,
    kind: "astroligyapp.release-evidence",
    source: {
      repository: "https://github.com/hbkdad/astroligyapp",
      commit,
      tree,
      sourceDateEpoch: Number(epoch),
      dockerfileSha256: sha256(readFileSync(join(root, "Dockerfile"))),
    },
    subject: {
      imageId: imageA.Id,
      platform: "linux/amd64",
      reproducibleBuilds: 2,
    },
    applicationLicense: packageManifest.license,
    sbom: {
      format: "SPDX-2.3",
      sha256: sha256(sbomJson),
      packageCount: normalized.packages.length,
      unresolvedLicenseCount,
    },
    scans: {
      gitSecrets: "pass",
      imageSecrets: "pass",
      imageVulnerabilities: "pass",
    },
    tools,
    signature: null,
    attestation: null,
  };
  validateArtifactManifest(manifest, {
    commit,
    tree,
    imageId: imageA.Id,
    sbomSha256: sha256(sbomJson),
  });
  runTamperTests(manifest);
  writeFileSync(
    join(evidence, "artifact-manifest.json"),
    canonicalJson(manifest),
  );
  console.log(
    `release artifact gate passed: ${imageA.Id}, ${normalized.packages.length} packages, ${unresolvedLicenseCount} unresolved license assertions`,
  );
} finally {
  for (const tag of tags)
    run("docker", ["image", "rm", "--force", tag], { tolerateFailure: true });
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function build(source, tag, archivePath, inputs) {
  run(
    "docker",
    [
      "buildx",
      "build",
      "--no-cache",
      "--platform=linux/amd64",
      "--provenance=false",
      "--sbom=false",
      `--output=type=oci,dest=${archivePath},rewrite-timestamp=true`,
      "--secret",
      "id=next_server_actions_encryption_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
      "--build-arg",
      `NEXT_DEPLOYMENT_ID=${inputs.deploymentId}`,
      "--build-arg",
      `SOURCE_DATE_EPOCH=${inputs.epoch}`,
      "--build-arg",
      `SOURCE_REVISION=${inputs.commit}`,
      "--build-arg",
      `SOURCE_CREATED=${inputs.created}`,
      "--tag",
      tag,
      source,
    ],
    { env: { ...process.env, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: secret } },
  );
  run("docker", ["load", "--input", archivePath]);
}

function inspect(tag) {
  return JSON.parse(capture("docker", ["image", "inspect", tag]))[0];
}

function inspectOciArchive(archivePath, suffix) {
  const directory = join(temporaryRoot, `oci-${suffix}`);
  run("powershell", [
    "-NoProfile",
    "-Command",
    `New-Item -ItemType Directory -Path '${directory.replaceAll("'", "''")}' | Out-Null; tar -xf '${archivePath.replaceAll("'", "''")}' -C '${directory.replaceAll("'", "''")}'`,
  ]);
  const index = JSON.parse(readFileSync(join(directory, "index.json"), "utf8"));
  const manifestDigest = index.manifests[0].digest;
  const manifest = JSON.parse(
    readFileSync(
      join(directory, "blobs", "sha256", manifestDigest.slice(7)),
      "utf8",
    ),
  );
  return {
    directory,
    manifest: manifestDigest,
    config: manifest.config.digest,
    layers: manifest.layers.map((layer) => layer.digest),
  };
}

function summarizeLayout({ manifest, config, layers }) {
  return { manifest, config, layers };
}

function compareOciLayers(layoutA, layoutB) {
  const drift = [];
  const count = Math.max(layoutA.layers.length, layoutB.layers.length);
  for (let index = 0; index < count; index += 1) {
    const digestA = layoutA.layers[index];
    const digestB = layoutB.layers[index];
    if (digestA === digestB) continue;
    const filesA = extractAndHashLayer(layoutA, digestA, `a-${index}`);
    const filesB = extractAndHashLayer(layoutB, digestB, `b-${index}`);
    const paths = [...new Set([...filesA.keys(), ...filesB.keys()])].sort();
    drift.push({
      index,
      digestA,
      digestB,
      changedFiles: paths
        .filter((path) => filesA.get(path) !== filesB.get(path))
        .slice(0, 100)
        .map((path) => ({ path, a: filesA.get(path), b: filesB.get(path) })),
    });
  }
  return drift;
}

function extractAndHashLayer(layout, digest, suffix) {
  if (!digest) return new Map();
  const directory = join(temporaryRoot, `layer-${suffix}`);
  mkdirSync(directory);
  run("tar", [
    "-xf",
    join(layout.directory, "blobs", "sha256", digest.slice(7)),
    "-C",
    directory,
  ]);
  return hashTree(directory);
}

function hashTree(directory, relative = "", result = new Map()) {
  for (const entry of readdirSync(join(directory, relative), {
    withFileTypes: true,
  })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    const fullPath = join(directory, path);
    if (entry.isDirectory()) {
      hashTree(directory, path, result);
    } else if (entry.isSymbolicLink()) {
      result.set(path, `link:${readlinkSync(fullPath)}`);
    } else if (lstatSync(fullPath).isFile()) {
      result.set(
        path,
        createHash("sha256").update(readFileSync(fullPath)).digest("hex"),
      );
    }
  }
  return result;
}

function runTamperTests(manifest) {
  for (const mutate of [
    (copy) => (copy.source.commit = "0".repeat(40)),
    (copy) => (copy.subject.imageId = `sha256:${"1".repeat(64)}`),
    (copy) => (copy.sbom.sha256 = `sha256:${"2".repeat(64)}`),
    (copy) => (copy.scans.imageSecrets = "fail"),
    (copy) => (copy.signature = "untrusted-local-claim"),
  ]) {
    const copy = structuredClone(manifest);
    mutate(copy);
    assert.throws(() =>
      validateArtifactManifest(copy, {
        commit: manifest.source.commit,
        tree: manifest.source.tree,
        imageId: manifest.subject.imageId,
        sbomSha256: manifest.sbom.sha256,
      }),
    );
  }
  assert.throws(() =>
    assertImmutablePromotionReference("example.invalid/astroligyapp:latest"),
  );
  assert.doesNotThrow(() =>
    assertImmutablePromotionReference(
      `123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp@${manifest.subject.imageId}`,
    ),
  );
}

function capture(command, args, options = {}) {
  return run(command, args, { ...options, capture: true }).stdout;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.tolerateFailure)
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}${result.stderr ? `\n${result.stderr}` : ""}`,
    );
  return result;
}
