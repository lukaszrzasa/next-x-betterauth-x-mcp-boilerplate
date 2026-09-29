import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { regenerateRecoveryCodes } from "@/app/(AuthModule)/_/db/settings/twoFactor/regenerateRecoveryCodes";
import { currentPasswordOnlySchema } from "@/app/(AuthModule)/_/schemas/settings";

/** Replacement codes: enrolled and verified, password plus the existing step-up. */
export const regenerateRecoveryCodesOperation = defineAction({
  name: "settings.recoveryCodes.regenerate",
  schema: currentPasswordOnlySchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: (ctx, input) => regenerateRecoveryCodes(ctx, input),
});
