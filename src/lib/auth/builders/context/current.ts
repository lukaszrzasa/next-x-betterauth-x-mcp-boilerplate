import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { requestLocale } from "@/src/lib/i18n/resolveLocale";
import { Ctx, type AuthedCtx, type PublicCtx } from "./ctx";
import { createLogger } from "./logger";

/**
 * The context of the operation a piece of code is running in, for the one
 * kind of code that cannot be handed it: infrastructure reached through a
 * provider callback. When an operation calls `auth.api.sendVerificationEmail`,
 * Better Auth calls the app's `sendVerificationEmail` hook with no context;
 * the email log still has to name the admin who asked for it. Everything
 * that *can* take a context as a parameter does - this is not a way to skip
 * passing one.
 */
const storage = new AsyncLocalStorage<AuthedCtx | PublicCtx>();

/** @internal The builder runs step-up and the handler inside their operation's context. */
export function runInOperationContext<T>(ctx: AuthedCtx | PublicCtx, run: () => T): T {
  return storage.run(ctx, run);
}

/** The enclosing operation's context, or null outside any operation. */
export function currentOperationContext(): AuthedCtx | PublicCtx | null {
  return storage.getStore() ?? null;
}

/**
 * A public context for work Better Auth starts on its own HTTP endpoints
 * (sign-up, the forgot-password request, the sign-in email code), which no
 * operation wraps. It is anonymous by construction: whatever session cookie
 * the request carries is not read, so the provider's pre-session flows are
 * never attributed to an account. Headers only supply request metadata.
 */
export function providerRequestContext(name: string, headers?: Headers | null): PublicCtx {
  const requestId = randomUUID();
  const requestHeaders = new Headers(headers ?? undefined);
  return Ctx.create<null>({
    user: null,
    session: null,
    stepUp: null,
    requestId,
    ip: clientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent"),
    locale: requestLocale(requestHeaders),
    requestHeaders,
    log: createLogger({ requestId, action: name }),
  });
}

/** Proxy-provided IPs are audit metadata, never authorization evidence. */
export function clientIp(headers: Headers): string | null {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip");
}
