import assert from "node:assert/strict";

export function sortManifestRecord(record) {
  assert.ok(
    record !== null && typeof record === "object" && !Array.isArray(record),
    "Next route manifest must be a JSON object",
  );

  return sortManifestValue(record);
}

export function sortManifestValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortManifestValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortManifestValue(nestedValue)]),
    );
  }
  return value;
}

export function serializeEdgeServerReferenceManifest(manifest) {
  const normalized = sortManifestRecord({
    ...manifest,
    encryptionKey: "process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
  });
  return `self.__RSC_SERVER_MANIFEST=${JSON.stringify(JSON.stringify(normalized))}`;
}
