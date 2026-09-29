import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { retrySessionRefresh } from "@/app/(AuthModule)/_/services/sessions/sessionEffects";

/**
 * Refreshes committed provider user copies only; touches no factor data or
 * grant. Permitted after disabling, when no factor exists.
 */
export const retryFactorSessionRefreshOperation = defineAction({
  name: "settings.authenticator.retrySessionRefresh",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx) => retrySessionRefresh(ctx),
});
