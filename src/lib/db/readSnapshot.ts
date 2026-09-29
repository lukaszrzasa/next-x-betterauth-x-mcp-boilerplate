import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./index";

type ReadTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Local to the read transaction: a slow query fails safely instead of hanging. */
export const READ_STATEMENT_TIMEOUT_MS = 5_000;

/**
 * Runs `read` in one repeatable-read, read-only transaction with a local
 * statement timeout, so a count and the page it describes (or a record and
 * its related rows) come from the same snapshot and a slow plan is bounded.
 */
export function withReadSnapshot<T>(
  read: (tx: ReadTransaction) => Promise<T>,
  { statementTimeoutMs = READ_STATEMENT_TIMEOUT_MS }: { statementTimeoutMs?: number } = {},
): Promise<T> {
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs <= 0) {
    throw new RangeError("statementTimeoutMs must be a positive integer.");
  }
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(String(statementTimeoutMs))}`);
      return read(tx);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
