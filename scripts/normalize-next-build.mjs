import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  canonicalizeClientReferenceManifest,
  serializeEdgeServerReferenceManifest,
  sortManifestRecord,
} from "./lib/next-build-normalization.mjs";

const keyPath = process.argv[2];
assert.ok(keyPath, "a BuildKit secret path is required");

const key = readFileSync(keyPath);
assert.ok(key.length >= 32, "the build reproducibility key must be 32 bytes");

const preview = {
  previewModeId: derive("next-preview-mode-id", 16),
  previewModeSigningKey: derive("next-preview-signing-key", 32),
  previewModeEncryptionKey: derive("next-preview-encryption-key", 32),
};

for (const path of [
  ".next/prerender-manifest.json",
  ".next/standalone/.next/prerender-manifest.json",
]) {
  const manifestPath = resolve(path);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.ok(manifest.preview, `Next preview metadata is missing from ${path}`);
  manifest.preview = preview;
  writeFileSync(manifestPath, JSON.stringify(manifest));
}

// Next 16.3's Webpack pages-manifest plugin records entries in compiler
// completion order. The two route maps are semantically unordered, but that
// insertion order can vary between otherwise identical builds. Canonicalize
// only those explained route-map records before the standalone tree is copied.
for (const path of [
  ".next/app-path-routes-manifest.json",
  ".next/server/app-paths-manifest.json",
  ".next/standalone/.next/app-path-routes-manifest.json",
  ".next/standalone/.next/server/app-paths-manifest.json",
]) {
  const manifestPath = resolve(path);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(manifestPath, JSON.stringify(sortManifestRecord(manifest)));
}

// The same plugin records Server Action maps from traversal/plugin-state order.
// Canonicalize the exact JSON record and its JavaScript edge-runtime projection.
for (const directory of [".next/server", ".next/standalone/.next/server"]) {
  const jsonPath = resolve(directory, "server-reference-manifest.json");
  const manifest = sortManifestRecord(
    JSON.parse(readFileSync(jsonPath, "utf8")),
  );
  writeFileSync(jsonPath, JSON.stringify(manifest));

  writeFileSync(
    resolve(directory, "server-reference-manifest.js"),
    serializeEdgeServerReferenceManifest(manifest),
  );
}

const clientManifestRoots = [
  resolve(".next/server/app"),
  resolve(".next/standalone/.next/server/app"),
];
const clientManifestSets = clientManifestRoots.map(
  findClientReferenceManifests,
);
assert.ok(
  clientManifestSets[0].length > 0,
  "Next client manifests are missing",
);
assert.deepEqual(
  clientManifestSets[0].map((path) => relative(clientManifestRoots[0], path)),
  clientManifestSets[1].map((path) => relative(clientManifestRoots[1], path)),
  "root and standalone client-reference manifest sets differ",
);
for (const paths of clientManifestSets) {
  for (const path of paths) {
    writeFileSync(
      path,
      canonicalizeClientReferenceManifest(readFileSync(path, "utf8")),
    );
  }
}

function derive(context, bytes) {
  return createHmac("sha256", key)
    .update(context)
    .digest("hex")
    .slice(0, bytes * 2);
}

function findClientReferenceManifests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return findClientReferenceManifests(path);
      }
      return entry.isFile() &&
        entry.name.endsWith("_client-reference-manifest.js")
        ? [path]
        : [];
    })
    .sort();
}
