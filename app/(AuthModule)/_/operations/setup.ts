import "server-only";

import { auth } from "@/src/lib/auth";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { ActionError } from "@/src/lib/auth/errors";
import { markInstallationComplete } from "@/src/lib/auth/installation";
import { withInstallationTransaction } from "@/app/(AuthModule)/_/db/setup/installationTransaction";
import { setupRootAdminSchema } from "@/app/(AuthModule)/_/schema";

/**
 * The one-time bootstrap: the root administrator of an empty installation.
 * Public, because nobody can be signed in yet. Unexpected errors propagate
 * as they are: the builder logs them with their cause chain and answers the
 * client with an opaque INTERNAL error.
 */
export const setupRootAdmin = defineAction({
  name: "auth.setupRootAdmin",
  auth: "public",
  schema: setupRootAdminSchema,
  handler: async (ctx, input) => {
    const rootUserId = await withInstallationTransaction(ctx, async (installation) => {
      if (await installation.isInstalled()) {
        throw new ActionError("FORBIDDEN", {
          message: { key: "auth.errors.setupUnavailable" },
        });
      }
      // Root is an admin who must enroll an authenticator before anything else.
      return installation.createRootAdmin({
        name: input.name,
        email: input.email,
        password: input.password,
        role: "admin",
        twoFactorRequired: true,
      });
    });

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
