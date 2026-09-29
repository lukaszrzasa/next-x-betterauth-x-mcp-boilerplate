import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, staffLog } from "@/src/lib/db";
import type { StaffLogBlock } from "@/app/(LogsModule)/_/staffLog/blocks";

/** A validated entry with everything the row holds already decided. */
export type PreparedStaffLogEntry = {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  message: StaffLogBlock[];
  /** The message as the plain sentence it renders to, for search. */
  messageText: string;
};

/**
 * One insert, its own statement: no transaction, no lock and no key. The
 * same action recorded twice is two entries.
 */
export async function insertStaffLog(_ctx: AuthedCtx, entry: PreparedStaffLogEntry): Promise<void> {
  await db.insert(staffLog).values({
    actorId: entry.actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    message: entry.message,
    messageText: entry.messageText,
  });
}
