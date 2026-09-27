import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { completePasswordReset } from "@/app/(AuthModule)/_/db/settings/password/completePasswordReset";
import { completePasswordResetSchema } from "@/app/(AuthModule)/_/schemas/settings";

/**
 * Completion of the public lost-password flow, through the guarded path so
 * it shares the account lock with the settings lifecycles. The provider's
 * token is the whole authority; no session, current password or second
 * factor is required, exactly as before.
 */
export const completePasswordResetOperation = defineAction({
  name: "auth.passwordReset.complete",
  auth: "public",
  schema: completePasswordResetSchema,
  mcpAllowed: false,
  // TODO(audit): subject established by the reset token; never the token or password.
  auditLog: (ctx, event) => `${ctx.requestId}: ${event.outcome}`,
  handler: (ctx, input) => completePasswordReset(ctx, input),
});
