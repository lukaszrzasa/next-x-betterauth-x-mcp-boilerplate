import "server-only";

import { and, eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { authenticatorSetupRequest, db } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { isUuid } from "@/app/(AuthModule)/_/db/settings/shared/ids";
import type { SetupTargetSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { CancelOutcome } from "@/app/(AuthModule)/_/types/settings";
import { cancelPendingSetupRequests } from "./setupRequests";

/** Abandons the owner's pending attempt; an enrollment's unverified row goes too, a verified factor never. */
export async function cancelSetup(ctx: AuthedCtx, input: SetupTargetSchema): Promise<CancelOutcome> {
  if (!isUuid(input.requestId)) return { status: "unchanged" };
  return withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const [row] = await reads
      .select({ state: authenticatorSetupRequest.state })
      .from(authenticatorSetupRequest)
      .where(and(eq(authenticatorSetupRequest.id, input.requestId), eq(authenticatorSetupRequest.userId, ctx.user.id)))
      .limit(1);
    if (row?.state !== "pending") return { status: "unchanged" };
    const cancelled = await db.transaction((tx) => cancelPendingSetupRequests(ctx, tx, ctx.user.id));
    return { status: cancelled > 0 ? "completed" : "unchanged" };
  });
}
