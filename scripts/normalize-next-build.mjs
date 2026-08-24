import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const keyPath = process.argv[2];
assert.ok(keyPath, "a BuildKit secret path is required");

const key = readFileSync(keyPath);
assert.ok(key.length >= 32, "the build reproducibility key must be 32 bytes");

const manifestPath = resolve(".next/prerender-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.ok(manifest.preview, "Next prerender preview metadata is missing");

manifest.preview = {
  previewModeId: derive("next-preview-mode-id", 16),
  previewModeSigningKey: derive("next-preview-signing-key", 32),
  previewModeEncryptionKey: derive("next-preview-encryption-key", 32),
};

writeFileSync(manifestPath, JSON.stringify(manifest));

function derive(context, bytes) {
  return createHmac("sha256", key)
    .update(context)
    .digest("hex")
    .slice(0, bytes * 2);
}
