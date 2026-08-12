import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { betterAuthSchema } from "./auth-schema";
import * as schema from "./schema";

export function createDatabase(databaseUrl: string) {
  if (!databaseUrl.startsWith("postgresql://")) {
    throw new Error("A server-only PostgreSQL DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}

export function createAuthDatabase(databaseUrl: string) {
  if (!databaseUrl.startsWith("postgresql://")) {
    throw new Error("A server-only PostgreSQL AUTH_DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  return {
    db: drizzle(pool, { schema: betterAuthSchema }),
    pool,
    close: () => pool.end(),
  };
}
