import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { findProfile } from "@/app/(AuthModule)/_/db/profile/profileReads";
import { accountNotFoundError } from "@/app/(AuthModule)/_/errors/settings";
import type { ProfileSettings } from "@/app/(AuthModule)/_/types/settings";

/**
 * The actor's own profile. Every settings operation is authenticated,
 * MCP-disabled, derives its subject from `ctx.user.id` and needs no
 * administrative permission or staff role; the builder's enrollment check
 * keeps a required-but-unenrolled account out of all of them.
 */
export const getProfileOperation = defineAction({
  name: "settings.profile.get",
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx): Promise<ProfileSettings> => {
    const profile = await findProfile(ctx);
    if (!profile) throw accountNotFoundError();
    return { name: profile.name };
  },
});
