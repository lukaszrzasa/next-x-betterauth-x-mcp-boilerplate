import "server-only";

import { eq } from "drizzle-orm";

import { db, emailLog } from "@/src/lib/db";
import type { LogContext } from "@/app/(LogsModule)/_/types";

/** Narrow reads of one attempt: only the columns a recorder decides on. */

export type AttemptReader = Pick<typeof db, "select">;

/** The attempt a record key names, with the fingerprint of what was recorded under it. */
export type RecordedKey = { id: string; inputDigest: string };

export async function findAttemptByRecordKeyWith(
  reader: AttemptReader,
  recordKey: string,
): Promise<RecordedKey | null> {
  const [row] = await reader
    .select({ id: emailLog.id, inputDigest: emailLog.inputDigest })
    .from(emailLog)
    .where(eq(emailLog.recordKey, recordKey))
    .limit(1);
  return row ?? null;
}

export function findAttemptByRecordKey(_ctx: LogContext, recordKey: string): Promise<RecordedKey | null> {
  return findAttemptByRecordKeyWith(db, recordKey);
}

/** What an attempt's completion currently is; the digest is null while it is `sending`. */
export type CompletionState = {
  status: string;
  startedAt: Date;
  completionDigest: string | null;
};

export async function findCompletionState(_ctx: LogContext, id: string): Promise<CompletionState | null> {
  const [row] = await db
    .select({
      status: emailLog.status,
      startedAt: emailLog.startedAt,
      completionDigest: emailLog.completionDigest,
    })
    .from(emailLog)
    .where(eq(emailLog.id, id))
    .limit(1);
  return row ?? null;
}
