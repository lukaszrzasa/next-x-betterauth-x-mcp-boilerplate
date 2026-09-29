import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { changeOwnPassword } from "@/app/(AuthModule)/_/db/settings/password/changeOwnPassword";
import { changePasswordSchema } from "@/app/(AuthModule)/_/schemas/settings";

/**
 * Verified email and, for an enrolled account, the five-minute step-up; a
 * user without an authenticator is protected by the current-password check
 * inside the service. Never MCP-eligible.
 */
export const changePasswordOperation = defineAction({
  name: "settings.password.change",
  schema: changePasswordSchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: (ctx, input) => changeOwnPassword(ctx, input),
});
