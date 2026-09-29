import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { messageText } from "@/app/(LogsModule)/_/staffLog/blocks";
import { staffLogEntrySchema } from "@/app/(LogsModule)/_/staffLog/schema";
import { StaffLogError, type StaffLogEntry } from "@/app/(LogsModule)/_/staffLog/types";
import { insertStaffLog } from "@/app/(LogsModule)/admin/_/db/staff/insertStaffLog";

/**
 * Writes one entry for a staff action that succeeded. Call it from the
 * operation that performed the action, once the action is confirmed and with
 * the context it received: the actor is that context's user and cannot be
 * supplied. One action is one entry.
 *
 * Internal and server-only: a plain function of a trusted operation, not a
 * guarded action of its own, and never a Server Action, endpoint or MCP tool.
 * It lives in the admin scope because staff act in the dashboard: only
 * admin code can import it.
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
    await insertStaffLog(ctx, {
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
