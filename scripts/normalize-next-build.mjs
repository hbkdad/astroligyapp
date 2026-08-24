import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

function derive(context, bytes) {
  return createHmac("sha256", key)
    .update(context)
    .digest("hex")
    .slice(0, bytes * 2);
}
