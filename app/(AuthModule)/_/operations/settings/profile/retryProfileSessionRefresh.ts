import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { retrySessionRefresh } from "@/app/(AuthModule)/_/services/sessions/sessionEffects";

/** Refreshes already-committed provider user copies; cannot change profile data. */
export const retryProfileSessionRefreshOperation = defineAction({
  name: "settings.profile.retrySessionRefresh",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx) => retrySessionRefresh(ctx),
});
