import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { retrySessionRefresh } from "@/app/(AuthModule)/_/db/settings/shared/sessionEffects";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";

/** Re-syncs cached user copies after a committed factor change; touches no factor data or grant. */
export async function retryFactorSessionRefresh(ctx: AuthedCtx): Promise<SyncOutcome> {
  return withUserAccountLock(ctx, ctx.user.id, () => retrySessionRefresh(ctx));
}
