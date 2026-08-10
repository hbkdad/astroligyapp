import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";

import * as schema from "@/db/schema";
import type { AccountId } from "@/infrastructure/auth/account";

export interface IdentityTransaction {
  client: PoolClient;
  db: NodePgDatabase<typeof schema>;
}

export async function withIdentityTransaction<T>(
  pool: Pick<Pool, "connect">,
  accountId: AccountId,
  work: (transaction: IdentityTransaction) => Promise<T>,
): Promise<T> {
  if (!isUuid(accountId)) {
    throw new TypeError("A valid internal account identifier is required");
  }

  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("begin");
    transactionOpen = true;
    await client.query("set local role app_user");
    await client.query("select set_config('app.current_user_id', $1, true)", [
      accountId,
    ]);

    const result = await work({
      client,
      db: drizzle(client, { schema }),
    });
    await client.query("commit");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) {
      await client.query("rollback");
    }
    throw error;
  } finally {
    client.release();
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
