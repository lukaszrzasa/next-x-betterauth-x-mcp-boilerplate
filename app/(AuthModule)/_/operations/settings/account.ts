import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { readAccountSettings } from "@/app/(AuthModule)/_/db/settings/profile/readAccountSettings";

/** The account page's read: address, verification, factor state and the pending email request. */
export const getAccountOperation = defineAction({
  name: "settings.account.get",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx) => readAccountSettings(ctx),
});
