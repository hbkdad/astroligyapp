import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sortManifestRecord } from "./lib/next-build-normalization.mjs";

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

function derive(context, bytes) {
  return createHmac("sha256", key)
    .update(context)
    .digest("hex")
    .slice(0, bytes * 2);
}
