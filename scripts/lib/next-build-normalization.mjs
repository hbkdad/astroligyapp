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

export function canonicalizeClientReferenceManifest(source) {
  const marker =
    "globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[";
  assert.ok(
    source.startsWith(marker) && source.endsWith(";"),
    "unexpected Next client-reference manifest wrapper",
  );
  const assignmentEnd = source.indexOf("]=", marker.length);
  assert.ok(assignmentEnd > marker.length, "client-reference route is missing");
  const route = JSON.parse(source.slice(marker.length, assignmentEnd));
  assert.equal(
    typeof route,
    "string",
    "client-reference route must be a string",
  );
  const manifest = sortManifestRecord(
    JSON.parse(source.slice(assignmentEnd + 2, -1)),
  );
  return `${marker}${JSON.stringify(route)}]=${JSON.stringify(manifest)};`;
}
