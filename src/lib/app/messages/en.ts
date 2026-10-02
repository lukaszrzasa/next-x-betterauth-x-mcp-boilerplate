import common from "@/src/lib/i18n/messages/en.json";
import email from "@/src/lib/email/messages/en.json";
import auth from "@/app/(AuthModule)/_/messages/en.json";
import authAdmin from "@/app/(AuthModule)/admin/_/messages/en.json";
import logs from "@/app/(LogsModule)/_/messages/en.json";
import logsAdmin from "@/app/(LogsModule)/admin/_/messages/en.json";

/**
 * The English catalog, the source of truth every other locale is checked
 * against and typed from (`src/lib/i18n/next-intl.d.ts`). Each scope keeps
 * its own file next to its code; this is the one place they are composed,
 * under a namespace per scope, so a key reads as `auth.signIn.title`.
 */
export const messages = {
  ...common,
  email,
  auth,
  authAdmin,
  logs,
  logsAdmin,
} as const;
