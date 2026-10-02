import { APIError, createAuthMiddleware } from "better-auth/api";

import { requestLocale } from "@/src/lib/i18n/resolveLocale";
import { translateKey } from "@/src/lib/i18n/translate";

/**
 * Better Auth answers its own endpoints (sign-in, sign-up, the reset link,
 * the two-factor challenge) with English messages and a stable `code`. The
 * forms show that message as is, so it is rewritten here, once, at the
 * provider's boundary - the same rule as for the app's own refusals: the
 * handler names the problem, the boundary chooses the words. A code the
 * catalog does not know gets the generic sentence; the code itself is kept
 * for clients that branch on it.
 */
export const localizeProviderErrors = createAuthMiddleware(async (ctx) => {
  const returned = ctx.context.returned;
  if (!(returned instanceof APIError)) return;

  const code = typeof returned.body?.code === "string" ? returned.body.code : null;
  if (!code) return;

  const locale = requestLocale(ctx.headers ?? new Headers());
  const message =
    translateKey(locale, `errors.provider.${code}`) ?? translateKey(locale, "errors.provider.default");
  if (!message || message === returned.body?.message) return;

  throw new APIError(returned.status, { ...returned.body, code, message });
});
