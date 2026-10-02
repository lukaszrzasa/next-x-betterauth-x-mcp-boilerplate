import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { ac, roles } from "./permissions";
import { localizeProviderErrors } from "./localizeProviderErrors";
import { rejectSupersededResetTokens } from "./resetTokenPolicy";
import { TOTP_PERIOD_SECONDS } from "./stepUpPolicy";

import { appName } from "@/src/lib/config";
import { errorMessage } from "@/src/lib/errorMessage";
import { db } from "@/src/lib/db";
import { redisSecondaryStorage } from "@/src/lib/redis";
import {
  sendPasswordResetEmail,
  sendTwoFactorOtpEmail,
  sendVerificationEmail,
} from "@/src/lib/email";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { buildRoute } from "@/src/lib/routes";

const TWO_FACTOR_OTP_EXPIRES_IN_MINUTES = 5;

/**
 * Signed, encrypted copy of the session and user (incl. `role`,
 * `twoFactorRequired`, `twoFactorEnabled`) in the `session_data` cookie. The
 * proxy reads it without a store lookup. It can be up to `maxAge` stale, so
 * access decisions read the store with `disableCookieCache: true`.
 */
export const sessionCookieCache = {
  enabled: true,
  maxAge: 5 * 60,
  strategy: "jwe",
} as const;

/**
 * Better Auth's email code checks nothing about the address it mails to. The
 * step-up path already refuses email as a factor for an unverified address
 * (it may be attacker-supplied); the sign-in challenge must agree, or the root
 * admin - enrolled before ever confirming their email - would be offered a
 * code at exactly that address. The challenge user is resolved the way the
 * plugin does it: a signed `two_factor` cookie pointing at a verification row.
 */
const requireVerifiedEmailForOtp = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/two-factor/send-otp") return;

  const cookie = ctx.context.createAuthCookie("two_factor");
  const challenge = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!challenge) return; // The plugin answers with its own cookie error.

  const pending = await ctx.context.internalAdapter.findVerificationValue(challenge);
  const user = pending && (await ctx.context.internalAdapter.findUserById(pending.value));
  if (user && !user.emailVerified) {
    // Its own code, so the localized message is the specific one (`errors.provider`).
    throw new APIError("FORBIDDEN", {
      code: "EMAIL_NOT_VERIFIED_FOR_OTP",
      message: "Verify your email address before signing in with an email code.",
    });
  }
});

/**
 * Better Auth takes one `before` hook. Each guard filters on its own path and
 * returns nothing, so running them in sequence composes them; the first one
 * to throw ends the request.
 */
const beforeHooks = [requireVerifiedEmailForOtp, rejectSupersededResetTokens] as const;
const runBeforeHooks = createAuthMiddleware(async (ctx) => {
  for (const hook of beforeHooks) await hook(ctx);
});

export const auth = betterAuth({
  appName,
  hooks: { before: runBeforeHooks, after: localizeProviderErrors },
  user: {
    additionalFields: {
      // Server-owned enrollment policy, enforced before protected access.
      twoFactorRequired: { type: "boolean", defaultValue: false, input: false },
      // Server-owned security metadata: reset links issued at or before this
      // instant are refused (see `resetTokenPolicy.ts`). Written together with
      // an administrative email change; never a profile field or a UI value.
      passwordResetInvalidBefore: {
        type: "date",
        required: false,
        input: false,
        returned: false,
      },
      // Server-owned security generation: every credential, factor,
      // recovery-code and sign-in email change increments it, and operation
      // step-up grants are valid for exactly one generation (`stepUp.ts`).
      securityVersion: { type: "number", defaultValue: 0, input: false },
      // Server-owned authentication barrier: a committed sign-in email change
      // whose session revocation is not confirmed yet. `sessionAuthority.ts`
      // revokes and clears it before honouring any session of the account.
      sessionRevocationPending: { type: "boolean", defaultValue: false, input: false },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  /**
   * Sessions and rate-limit counters live in Redis instead of Postgres. Every
   * request validating a session becomes a Redis GET rather than a SQL query,
   * and rate limiting works across instances (the default in-memory store
   * counts per-process, so N instances allow N times the configured limit).
   *
   * Session rows are no longer written to the `session` table: reads always
   * come from Redis, and flushing Redis signs everyone out. Set
   * `session.storeSessionInDatabase` if you need the rows for auditing or for
   * admin screens that list a user's active sessions.
   */
  secondaryStorage: redisSecondaryStorage,
  session: { cookieCache: sessionCookieCache },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "user",
      adminRoles: ["admin"],
      adminUserIds: [],
      impersonationSessionDuration: 60 * 60,
    }),

    twoFactor({
      // Shown as the account label in authenticator apps.
      issuer: appName,

      // Authenticator app (TOTP).
      totpOptions: {
        digits: 6,
        period: TOTP_PERIOD_SECONDS,
      },

      // Email code (OTP) as a sign-in fallback when the authenticator is not at
      // hand. Sign-in only: the route handler hides `send-otp`/`verify-otp`
      // from signed-in sessions, and mid-session codes come from the step-up
      // runtime (`stepUp.ts`), which owns its own challenge and attempt budget.
      otpOptions: {
        period: TWO_FACTOR_OTP_EXPIRES_IN_MINUTES,
        digits: 6,
        allowedAttempts: 5,
        // Hashed: codes are only ever compared, never re-read or re-sent.
        storeOTP: "hashed",
        sendOTP: async ({ user, otp }, endpoint) => {
          await sendTwoFactorOtpEmail({
            to: user.email,
            code: otp,
            name: user.name,
            expiresInMinutes: TWO_FACTOR_OTP_EXPIRES_IN_MINUTES,
            recipient: { userId: user.id, name: user.name },
            providerRequest: endpoint?.headers,
          });
        },
      },

      // Recovery codes, handed to the user once when they enable 2FA.
      backupCodeOptions: {
        amount: 10,
        length: 10,
        storeBackupCodes: "encrypted",
      },

      // How long the user has to complete the challenge after their password
      // was accepted. The real session is only created once they do.
      twoFactorCookieMaxAge: 60 * 10,
      // How long `trustDevice: true` suppresses the challenge on this browser.
      trustDeviceMaxAge: 60 * 60 * 24 * 30,
    }),
    nextCookies(),
  ],
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }, request) => {
      await sendPasswordResetEmail({
        to: user.email,
        url,
        token,
        name: user.name,
        recipient: { userId: user.id, name: user.name },
        providerRequest: request?.headers,
      });
    },
  },
  rateLimit: { enabled: true, storage: "secondary-storage" },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    /**
     * Ordinary signup verification stays the provider's flow. Once it
     * verifies an address, a pending *correction* of that address (the
     * unverified-email settings flow) must not remain: a verified address is
     * changed through the dual-mailbox flow only. The cancellation is one
     * conditional statement owned by the email request persistence;
     * finalization re-reads the locked user row anyway, so a missed
     * cancellation here cannot authorize a correction. Imported lazily
     * because the settings code depends on this module.
     */
    afterEmailVerification: async (user) => {
      try {
        // eslint-disable-next-line persistence/require-context -- Provider verification hook has no operation context (ADR 0004).
        const { cancelCorrectionsForVerifiedAddress } = await import(
          "@/app/(AuthModule)/_/db/emailRequests/cancellation"
        );
        await cancelCorrectionsForVerifiedAddress(user.id);
      } catch (error) {
        // The verification itself is committed; finalization re-reads the
        // locked user row, so a missed cancellation cannot authorize anything.
        console.error(
          JSON.stringify({
            level: "error",
            message: "pending email correction not cancelled after verification",
            userId: user.id,
            error: errorMessage(error),
          }),
        );
      }
    },
    sendVerificationEmail: async ({ user, url, token }, request) => {
      // Better Auth's own `url` targets its API; the app confirms on its own page.
      const confirmation = new URL(
        buildRoute(authRoutes.emailConfirmation.href, undefined, { token }),
        url,
      );
      await sendVerificationEmail({
        to: user.email,
        url: confirmation.toString(),
        token,
        name: user.name,
        recipient: { userId: user.id, name: user.name },
        providerRequest: request?.headers,
      });
    },
  },
});
