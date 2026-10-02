import common from "@/src/lib/i18n/messages/pl.json";
import email from "@/src/lib/email/messages/pl.json";
import auth from "@/app/(AuthModule)/_/messages/pl.json";
import authAdmin from "@/app/(AuthModule)/admin/_/messages/pl.json";
import logs from "@/app/(LogsModule)/_/messages/pl.json";
import logsAdmin from "@/app/(LogsModule)/admin/_/messages/pl.json";

/** Polish, composed exactly like `en.ts`; the parity test keeps the two in step. */
export const messages = {
  ...common,
  email,
  auth,
  authAdmin,
  logs,
  logsAdmin,
};
