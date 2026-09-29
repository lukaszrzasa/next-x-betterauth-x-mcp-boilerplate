import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { beginEmailCorrection } from "@/app/(AuthModule)/_/db/settings/emailChange/beginEmailCorrection";
import { beginEmailCorrectionSchema } from "@/app/(AuthModule)/_/schemas/settings";

/**
 * The unverified-address correction: deliberately outside the shared
 * step-up (`none`, no verified-email requirement) because the ordinary
 * step-up refuses an unverified address. The service verifies the password
 * and, for an enrolled account, a fresh authenticator code through the
 * existing verifier without persisting a grant. Root follows the same rules.
 */
export const beginEmailCorrectionOperation = defineAction({
  name: "settings.emailCorrection.begin",
  schema: beginEmailCorrectionSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => beginEmailCorrection(ctx, input),
});
