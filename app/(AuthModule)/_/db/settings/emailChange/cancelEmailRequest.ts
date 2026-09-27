import "server-only";

import { and, eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, emailChangeRequest } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { isUuid } from "@/app/(AuthModule)/_/db/settings/shared/ids";
import type { EmailRequestTargetSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { CancelOutcome } from "@/app/(AuthModule)/_/types/settings";
import { isActive, markCancelled } from "./requests";

/** Withdraws the pending change; only its owner, and nothing to verify since nothing is committed. */
export async function cancelEmailRequest(ctx: AuthedCtx, input: EmailRequestTargetSchema): Promise<CancelOutcome> {
  if (!isUuid(input.requestId)) return { status: "unchanged" };
  return withUserAccountLock(ctx, ctx.user.id, async () => {
    const [row] = await db
      .select()
      .from(emailChangeRequest)
      .where(and(eq(emailChangeRequest.id, input.requestId), eq(emailChangeRequest.userId, ctx.user.id)))
      .limit(1);
    if (!row || !isActive(row)) return { status: "unchanged" };
    const cancelled = await markCancelled(db, row.id, "user", new Date());
    return { status: cancelled ? "completed" : "unchanged" };
  });
}
