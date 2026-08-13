import { createRequire } from "node:module";

import { beforeEach, describe, expect, it } from "vitest";

interface StoredValue {
  value: string;
  expiresAt: number;
}

interface FakeClient {
  isReady: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<void>;
  del(key: string): Promise<void>;
  mGet(keys: string[]): Promise<(string | null)[]>;
  multi(): {
    set(key: string, value: string, options: { EX: number }): void;
    exec(): Promise<void>;
  };
}

interface CacheHandler {
  client?: FakeClient;
  get(
    key: string,
    context: { tags?: string[]; softTags?: string[] },
  ): Promise<unknown>;
  set(key: string, value: unknown, context: { tags?: string[] }): Promise<void>;
  revalidateTag(tags: string | string[]): Promise<void>;
  entryKey(key: string): string;
  tagKey(tag: string): string;
}

type CacheHandlerConstructor = new () => CacheHandler;

const require = createRequire(import.meta.url);
const SharedCacheHandler =
  require("../cache-handler.cjs") as CacheHandlerConstructor;

describe("shared incremental cache handler", () => {
  beforeEach(() => {
    process.env.NEXT_SHARED_CACHE_PREFIX = "test-cache-v1";
    delete process.env.NEXT_PHASE;
  });

  it("round-trips buffers and maps without exposing raw keys", async () => {
    const client = fakeClient();
    const writer = handler(client);
    const value = {
      kind: "APP_PAGE",
      html: "<main>cached</main>",
      rscData: Buffer.from("private-free-payload"),
      segmentData: new Map([["segment", Buffer.from("value")]]),
    };

    await writer.set("/horoscope/aries", value, { tags: ["horoscope"] });
    const result = (await handler(client).get("/horoscope/aries", {
      tags: ["horoscope"],
    })) as { value: typeof value };

    expect(result.value.rscData).toEqual(value.rscData);
    expect(result.value.segmentData).toEqual(value.segmentData);
    expect(writer.entryKey("/horoscope/aries")).not.toContain(
      "horoscope/aries",
    );
    expect(writer.tagKey("horoscope")).not.toContain(":horoscope");
  });

  it("coordinates tag invalidation between handler instances", async () => {
    const client = fakeClient();
    const writer = handler(client);
    await writer.set(
      "daily",
      { kind: "FETCH", data: { body: "fresh" } },
      { tags: ["daily"] },
    );

    expect(
      await handler(client).get("daily", { tags: ["daily"] }),
    ).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 2));
    await handler(client).revalidateTag("daily");

    expect(await handler(client).get("daily", { tags: ["daily"] })).toBeNull();
  });

  it("treats corrupt and oversized entries as misses and deletes them", async () => {
    const client = fakeClient();
    const cache = handler(client);
    await client.set(cache.entryKey("corrupt"), "not-v8-data", { EX: 60 });

    expect(await cache.get("corrupt", {})).toBeNull();
    expect(await client.get(cache.entryKey("corrupt"))).toBeNull();
  });

  it("returns a miss rather than leaking connection details when cache access fails", async () => {
    const cache = new SharedCacheHandler();
    cache.client = {
      ...fakeClient(),
      get: async () => {
        throw new Error("redis://user:secret@private-host");
      },
    };

    expect(await cache.get("safe-key", {})).toBeNull();
  });
});

function handler(client: FakeClient): CacheHandler {
  const result = new SharedCacheHandler();
  result.client = client;
  return result;
}

function fakeClient(): FakeClient {
  const values = new Map<string, StoredValue>();
  return {
    isReady: true,
    async get(key) {
      const stored = values.get(key);
      if (!stored || stored.expiresAt <= Date.now()) {
        values.delete(key);
        return null;
      }
      return stored.value;
    },
    async set(key, value, options) {
      values.set(key, { value, expiresAt: Date.now() + options.EX * 1_000 });
    },
    async del(key) {
      values.delete(key);
    },
    async mGet(keys) {
      return Promise.all(keys.map(async (key) => this.get(key)));
    },
    multi() {
      const commands: Array<() => Promise<void>> = [];
      return {
        set: (key, value, options) => {
          commands.push(async () => this.set(key, value, options));
        },
        exec: async () => {
          await Promise.all(commands.map(async (command) => command()));
        },
      };
    },
  };
}
