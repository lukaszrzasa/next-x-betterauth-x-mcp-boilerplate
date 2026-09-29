import "server-only";

import { asc, eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { staffLog, user } from "@/src/lib/db";
import { withReadSnapshot } from "@/src/lib/db/readSnapshot";

export type StaffLogPresence = {
  /** Staff members with at least one entry, by their current name. */
  actors: Array<{ id: string; name: string }>;
  actions: string[];
};

/** The staff members and actions the log contains, both from one snapshot. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every service entry takes the context
export async function findStaffLogPresence(_ctx: AuthedCtx): Promise<StaffLogPresence> {
  return withReadSnapshot(async (tx) => {
    const actors = await tx
      .selectDistinct({ id: user.id, name: user.name })
      .from(staffLog)
      .innerJoin(user, eq(user.id, staffLog.actorId))
      .orderBy(asc(user.name), asc(user.id));
    const actions = await tx.selectDistinct({ action: staffLog.action }).from(staffLog).orderBy(asc(staffLog.action));
    return { actors, actions: actions.map((row) => row.action) };
  });
}
