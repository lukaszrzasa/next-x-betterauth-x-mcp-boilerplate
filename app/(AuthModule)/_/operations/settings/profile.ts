import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { readProfileSettings } from "@/app/(AuthModule)/_/db/settings/profile/readProfileSettings";
import { retryProfileSessionRefresh } from "@/app/(AuthModule)/_/db/settings/profile/retryProfileSessionRefresh";
import { updateDisplayName } from "@/app/(AuthModule)/_/db/settings/profile/updateDisplayName";
import { updateDisplayNameSchema } from "@/app/(AuthModule)/_/schemas/settings";

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
  handler: (ctx) => readProfileSettings(ctx),
});

export const updateDisplayNameOperation = defineAction({
  name: "settings.profile.updateName",
  schema: updateDisplayNameSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => updateDisplayName(ctx, input),
});

/** Refreshes already-committed provider user copies; cannot change profile data. */
export const retryProfileSessionRefreshOperation = defineAction({
  name: "settings.profile.retrySessionRefresh",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx) => retryProfileSessionRefresh(ctx),
});
