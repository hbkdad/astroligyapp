import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

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
