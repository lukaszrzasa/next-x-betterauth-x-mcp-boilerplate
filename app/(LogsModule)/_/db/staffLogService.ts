import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, staffLog } from "@/src/lib/db";
import { messageText, type StaffLogBlock } from "@/app/(LogsModule)/_/staffLog/blocks";
import { staffLogEntrySchema } from "@/app/(LogsModule)/_/staffLog/schema";

export type StaffLogEntry = {
  /** What was done, e.g. `user.banned`. */
  action: string;
  /** What it was done to: any module's resource, by type and ID. */
  resource: { type: string; id: string };
  message: StaffLogBlock[];
};

/** The entry could not be written; the staff action it describes has already happened. */
export class StaffLogError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StaffLogError";
  }
}

/**
 * Writes one entry for a staff action that succeeded. Call it from the
 * service that performed the action, once the action is confirmed and with
 * the context it received: the actor is that context's user and cannot be
 * supplied. One action is one entry.
 *
 * Throws `StaffLogError` when the entry is invalid or cannot be stored. The
 * action is not undone by that; the caller tells the staff member that their
 * change was made but not recorded.
 */
export async function recordStaffLog(ctx: AuthedCtx, entry: StaffLogEntry): Promise<void> {
  const parsed = staffLogEntrySchema.safeParse(entry);
  if (!parsed.success) {
    // Paths and codes only: an issue never repeats the value it refused.
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`).join(", ");
    throw new StaffLogError(`Invalid staff log entry (${issues}).`);
  }

  const { action, resource, message } = parsed.data;
  try {
    await db.insert(staffLog).values({
      actorId: ctx.user.id,
      action,
      resourceType: resource.type,
      resourceId: resource.id,
      message,
      messageText: messageText(message),
    });
  } catch (error) {
    throw new StaffLogError(`Staff log entry "${action}" could not be stored.`, { cause: error });
  }
}
