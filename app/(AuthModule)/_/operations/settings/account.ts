import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { findAccount } from "@/app/(AuthModule)/_/db/profile/profileReads";
import { accountNotFoundError } from "@/app/(AuthModule)/_/errors/settings";
import { enrollmentRequiredFor } from "@/app/(AuthModule)/_/policies/authenticator";
import type { AccountSettings } from "@/app/(AuthModule)/_/types/settings";
import { loadPendingEmailRequest } from "./emailChange/pendingRequest";

/** The account page's read: address, verification, factor state and policy, and the pending email request. */
export const getAccountOperation = defineAction({
  name: "settings.account.get",
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx): Promise<AccountSettings> => {
    const account = await findAccount(ctx);
    if (!account) throw accountNotFoundError();

    return {
      email: account.email,
      emailVerified: account.emailVerified,
      twoFactorEnabled: account.twoFactorEnabled,
      twoFactorRequired: enrollmentRequiredFor(account),
      pendingEmail: await loadPendingEmailRequest(ctx, account),
    };
  },
});
