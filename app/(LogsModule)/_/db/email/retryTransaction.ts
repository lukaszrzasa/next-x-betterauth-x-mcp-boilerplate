import "server-only";

import { desc, eq, or } from "drizzle-orm";

import { db, emailLog } from "@/src/lib/db";
import type { LogContext } from "@/app/(LogsModule)/_/types";
import { findAttemptByRecordKeyWith, type RecordedKey } from "./findAttempt";
import { insertAttemptWith, type ChainPosition, type PreparedAttempt } from "./insertAttempt";

/**
 * The transaction a retry is recorded in. A retry takes the next number of
 * its chain, and whether it may is decided on rows that must not move
 * meanwhile: the chain's original row is locked, and every retry of that
 * chain waits on it. The decisions are the operation's; this module opens
 * the transaction and hands it the reads and the one write below, all bound
 * to that transaction. Returning commits, throwing rolls back.
 *
 * A local tool for the retry chain, not a pattern for other writes: the
 * initial attempt and the completion are single statements.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RetryChain = {
  findByRecordKey(recordKey: string): Promise<RecordedKey | null>;
  /** The attempt a retry names, with the chain it belongs to (`null` on the original itself). */
  findPredecessor(id: string): Promise<{ id: string; originalLogId: string | null } | null>;
  /** Locks the chain's original row until the transaction ends: serializes every retry of the chain. */
  lockOriginal(originalId: string): Promise<{ recipientEmail: string; recipientUserId: string | null } | null>;
  findLatestAttempt(originalId: string): Promise<{ id: string; attemptNumber: number } | null>;
  /** The new row's ID, or `null` when the record key already names a row. */
  insertRetry(attempt: PreparedAttempt, position: ChainPosition): Promise<string | null>;
};

function chainFor(tx: Tx): RetryChain {
  return {
    findByRecordKey: (recordKey) => findAttemptByRecordKeyWith(tx, recordKey),
    async findPredecessor(id) {
      const [row] = await tx
        .select({ id: emailLog.id, originalLogId: emailLog.originalLogId })
        .from(emailLog)
        .where(eq(emailLog.id, id))
        .limit(1);
      return row ?? null;
    },
    async lockOriginal(originalId) {
      const [row] = await tx
        .select({ recipientEmail: emailLog.recipientEmail, recipientUserId: emailLog.recipientUserId })
        .from(emailLog)
        .where(eq(emailLog.id, originalId))
        .for("update");
      return row ?? null;
    },
    async findLatestAttempt(originalId) {
      const [row] = await tx
        .select({ id: emailLog.id, attemptNumber: emailLog.attemptNumber })
        .from(emailLog)
        .where(or(eq(emailLog.id, originalId), eq(emailLog.originalLogId, originalId)))
        .orderBy(desc(emailLog.attemptNumber))
        .limit(1);
      return row ?? null;
    },
    insertRetry: (attempt, position) => insertAttemptWith(tx, attempt, position),
  };
}

export function withRetryChain<T>(_ctx: LogContext, decide: (chain: RetryChain) => Promise<T>): Promise<T> {
  return db.transaction((tx) => decide(chainFor(tx)));
}
