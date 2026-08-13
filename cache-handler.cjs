/* eslint-disable @typescript-eslint/no-require-imports -- Next.js loads this cache boundary through require.resolve. */
const { createHash } = require("node:crypto");
const { deserialize, serialize } = require("node:v8");
const { PHASE_PRODUCTION_BUILD } = require("next/constants");
const FileSystemCache =
  require("next/dist/server/lib/incremental-cache/file-system-cache").default;
const { createClient } = require("redis");

const CONTRACT_VERSION = "1";
const DEFAULT_TTL_SECONDS = 31_536_000;
const MINIMUM_TTL_SECONDS = 60;
const MAXIMUM_ENTRY_BYTES = 10 * 1024 * 1024;

class SharedIncrementalCacheHandler {
  constructor(context) {
    this.client = undefined;
    this.connecting = undefined;
    this.prefix = configurationValue(
      "NEXT_SHARED_CACHE_PREFIX",
      "cosmic-cache-v1",
    );
    this.ttlSeconds = boundedInteger(
      process.env.NEXT_SHARED_CACHE_ENTRY_TTL_SECONDS,
      DEFAULT_TTL_SECONDS,
      MINIMUM_TTL_SECONDS,
      DEFAULT_TTL_SECONDS,
    );
    this.buildPhase = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
    this.fileSystemCache = context ? new FileSystemCache(context) : undefined;
  }

  async get(cacheKey, context) {
    if (this.buildPhase)
      return this.fileSystemCache?.get(cacheKey, context) ?? null;
    try {
      const client = await this.getClient();
      const encoded = await client.get(this.entryKey(cacheKey));
      if (encoded === null)
        return this.fileSystemFallback(cacheKey, context, client);
      if (Buffer.byteLength(encoded, "base64") > MAXIMUM_ENTRY_BYTES) {
        await this.deleteRuntimeEntry(cacheKey);
        return null;
      }

      let record;
      try {
        record = deserialize(Buffer.from(encoded, "base64"));
      } catch {
        await this.deleteRuntimeEntry(cacheKey);
        return null;
      }
      if (!validRecord(record)) {
        await this.deleteRuntimeEntry(cacheKey);
        return null;
      }

      const tags = uniqueStrings([
        ...record.tags,
        ...(Array.isArray(context?.tags) ? context.tags : []),
        ...(Array.isArray(context?.softTags) ? context.softTags : []),
      ]);
      if (tags.length > 0) {
        const timestamps = await client.mGet(
          tags.map((tag) => this.tagKey(tag)),
        );
        if (
          timestamps.some((timestamp) =>
            validTimestamp(timestamp, record.lastModified),
          )
        )
          return null;
      }

      return { lastModified: record.lastModified, value: record.value };
    } catch {
      cacheWarning("read unavailable");
      return this.fileSystemCache?.get(cacheKey, context) ?? null;
    }
  }

  async set(cacheKey, data, context) {
    if (this.buildPhase)
      return this.fileSystemCache?.set(cacheKey, data, context);
    try {
      const record = {
        contractVersion: CONTRACT_VERSION,
        lastModified: Date.now(),
        tags: uniqueStrings(Array.isArray(context?.tags) ? context.tags : []),
        value: data,
      };
      const encoded = serialize(record);
      if (encoded.byteLength > MAXIMUM_ENTRY_BYTES) return;
      const client = await this.getClient();
      await client.set(this.entryKey(cacheKey), encoded.toString("base64"), {
        EX: this.ttlSeconds,
      });
    } catch {
      cacheWarning("write unavailable");
    }
  }

  async revalidateTag(tags) {
    if (this.buildPhase) return this.fileSystemCache?.revalidateTag(tags);
    const normalized = uniqueStrings(Array.isArray(tags) ? tags : [tags]);
    if (normalized.length === 0) return;
    const client = await this.getClient();
    const timestamp = String(Date.now());
    const transaction = client.multi();
    for (const tag of normalized) {
      transaction.set(this.tagKey(tag), timestamp, { EX: this.ttlSeconds });
    }
    await transaction.exec();
  }

  resetRequestCache() {
    this.fileSystemCache?.resetRequestCache();
  }

  entryKey(cacheKey) {
    return `${this.prefix}:entry:${digest(cacheKey)}`;
  }

  tagKey(tag) {
    return `${this.prefix}:tag:${digest(tag)}`;
  }

  async deleteRuntimeEntry(cacheKey) {
    const client = await this.getClient();
    await client.del(this.entryKey(cacheKey));
  }

  async fileSystemFallback(cacheKey, context, client) {
    if (!this.fileSystemCache) return null;
    const fallback = await this.fileSystemCache.get(cacheKey, context);
    if (fallback === null) return null;
    const tags = uniqueStrings([
      ...(Array.isArray(context?.tags) ? context.tags : []),
      ...(Array.isArray(context?.softTags) ? context.softTags : []),
    ]);
    if (tags.length === 0) return fallback;
    const timestamps = await client.mGet(tags.map((tag) => this.tagKey(tag)));
    return timestamps.some((timestamp) =>
      validTimestamp(timestamp, fallback.lastModified),
    )
      ? null
      : fallback;
  }

  async getClient() {
    if (this.client?.isReady) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  async connect() {
    const url = cacheUrl();
    const connectTimeout = boundedInteger(
      process.env.NEXT_SHARED_CACHE_CONNECT_TIMEOUT_MS,
      1_000,
      100,
      10_000,
    );
    const client = createClient({
      url,
      socket: { connectTimeout, reconnectStrategy: false },
    });
    client.on("error", () => cacheWarning("connection unavailable"));
    try {
      await client.connect();
      this.client = client;
      return client;
    } catch (error) {
      client.destroy();
      throw error;
    }
  }
}

function cacheUrl() {
  const raw = process.env.NEXT_SHARED_CACHE_URL;
  if (
    typeof raw !== "string" ||
    raw.length < 12 ||
    raw.length > 2_048 ||
    /[\0\r\n]/u.test(raw)
  ) {
    throw new Error("shared cache unavailable");
  }
  const url = new URL(raw);
  const localAllowed =
    process.env.NEXT_SHARED_CACHE_ALLOW_INSECURE_LOCAL === "true";
  const localHost = ["localhost", "127.0.0.1", "::1", "valkey"].includes(
    url.hostname,
  );
  if (
    url.protocol !== "rediss:" &&
    !(localAllowed && localHost && url.protocol === "redis:")
  ) {
    throw new Error("shared cache unavailable");
  }
  return raw;
}

function validRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.contractVersion === CONTRACT_VERSION &&
    Number.isSafeInteger(value.lastModified) &&
    value.lastModified > 0 &&
    Array.isArray(value.tags) &&
    value.tags.every(validString) &&
    Object.prototype.hasOwnProperty.call(value, "value")
  );
}

function validTimestamp(value, createdAt) {
  if (value === null || !/^[0-9]{13}$/u.test(value)) return false;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp >= createdAt;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(validString))].slice(0, 128);
}

function validString(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\0\r\n]/u.test(value)
  );
}

function configurationValue(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!/^[a-z0-9][a-z0-9:_-]{2,63}$/u.test(value))
    throw new Error(`${name} is invalid`);
  return value;
}

function boundedInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === "") return fallback;
  if (!/^[0-9]+$/u.test(value))
    throw new Error("shared cache numeric configuration is invalid");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error("shared cache numeric configuration is invalid");
  return parsed;
}

function digest(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function cacheWarning(message) {
  if (process.env.NEXT_PRIVATE_DEBUG_CACHE === "1")
    console.warn(`[shared-cache] ${message}`);
}

module.exports = SharedIncrementalCacheHandler;
module.exports.__test = Object.freeze({ digest, validRecord, validTimestamp });
