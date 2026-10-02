import "server-only";

import type { ActionError } from "@/src/lib/auth/errors";
import type { Locale } from "@/src/lib/i18n/locales";
import { translateDescriptor, translateKey } from "@/src/lib/i18n/translate";

/**
 * The text a refusal shows the person, in the request's locale: the error's
 * descriptor when it carries one, otherwise the generic sentence for its
 * reason. A developer-only `message` never reaches a client as is.
 */
export function localizeActionError(error: ActionError, locale: Locale): string {
  if (error.descriptor) return translateDescriptor(locale, error.descriptor);
  return translateKey(locale, `errors.reason.${error.reason}`) ?? error.reason;
}
