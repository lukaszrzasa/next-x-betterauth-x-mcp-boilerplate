import "server-only";

import { eq } from "drizzle-orm";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { user } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { accountNotFoundError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { refreshUserSessions } from "@/app/(AuthModule)/_/db/settings/shared/sessionEffects";
import type { UpdateDisplayNameSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";

/** The display name alone, through the provider's self update, then an observed session refresh. */
export async function updateDisplayName(ctx: AuthedCtx, input: UpdateDisplayNameSchema): Promise<SyncOutcome> {
  return withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const [current] = await reads.select({ name: user.name }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
    if (!current) throw accountNotFoundError();
    if (current.name === input.name) return { status: "unchanged" };

    // Exactly one field reaches the provider; it applies its own input filter too.
    await auth.api.updateUser({ body: { name: input.name }, headers: ctx.getRequestHeaders() });
    // TODO(audit): Persist settings.profile.name_updated after this confirmed
    // write (ctx.requestId, actor user ID, UTC time, before/after name).

    if (!(await refreshUserSessions(ctx, "name updated but cached session copies were not refreshed"))) {
      return { status: "partial", committed: true, failedEffects: ["session-refresh"] };
    }
    return { status: "completed" };
  });
}
