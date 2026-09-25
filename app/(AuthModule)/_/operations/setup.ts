import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { markInstallationComplete } from "@/src/lib/auth/installation";
import { createRootAdminAccount } from "@/app/(AuthModule)/_/db/setupService";
import { setupRootAdminSchema } from "@/app/(AuthModule)/_/schema";

export const setupRootAdmin = defineAction({
  name: "auth.setupRootAdmin",
  auth: "public",
  schema: setupRootAdminSchema,
  handler: async (ctx, input) => {
    const rootUserId = await createRootAdminAccount(ctx, input);

    markInstallationComplete(rootUserId);

    try {
      // The confirmation URL is built by `emailVerification.sendVerificationEmail`.
      await auth.api.sendVerificationEmail({ body: { email: input.email } });
    } catch {
      ctx.log.warn(
        "Administrator created; confirmation email could not be sent.",
      );
    }

    return { created: true };
  },
});
