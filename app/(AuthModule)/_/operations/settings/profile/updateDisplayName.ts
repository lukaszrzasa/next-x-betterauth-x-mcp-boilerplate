import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { findProfile } from "@/app/(AuthModule)/_/db/profile/profileReads";
import { accountNotFoundError } from "@/app/(AuthModule)/_/errors/settings";
import { updateDisplayNameSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { refreshUserSessions } from "@/app/(AuthModule)/_/services/sessions/sessionEffects";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";

/**
 * The display name alone, through the provider's self update, then an
 * observed session refresh. An ordinary edit: the last successful write
 * wins, and nothing is serialized around it.
 */
export const updateDisplayNameOperation = defineAction({
  name: "settings.profile.updateName",
  schema: updateDisplayNameSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<SyncOutcome> => {
    const profile = await findProfile(ctx);
    if (!profile) throw accountNotFoundError();
    if (profile.name === input.name) return { status: "unchanged" };

    // Exactly one field reaches the provider; it applies its own input filter too.
    await auth.api.updateUser({ body: { name: input.name }, headers: ctx.getRequestHeaders() });

    const refreshed = await refreshUserSessions(ctx, "name updated but cached session copies were not refreshed");
    if (!refreshed) return { status: "partial", committed: true, failedEffects: ["session-refresh"] };
    return { status: "completed" };
  },
});
