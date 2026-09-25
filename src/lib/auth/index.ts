import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { ac, roles } from "./permissions";
import { TOTP_PERIOD_SECONDS } from "./stepUpPolicy";

import { appName } from "@/src/lib/config";
import { db } from "@/src/lib/db";
import { redisSecondaryStorage } from "@/src/lib/redis";
import {
  sendPasswordResetEmail,
  sendTwoFactorOtpEmail,
  sendVerificationEmail,
} from "@/src/lib/email";

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

export const auth = betterAuth({
  appName,
  user: {
    additionalFields: {
      // Server-owned enrollment policy, enforced before protected access.
      twoFactorRequired: { type: "boolean", defaultValue: false, input: false },
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

      // Email code (OTP). Configuring `sendOTP` is what makes "otp" show up in
      // the `twoFactorMethods` list returned on sign-in.
      otpOptions: {
        period: TWO_FACTOR_OTP_EXPIRES_IN_MINUTES,
        digits: 6,
        allowedAttempts: 5,
        // Hashed: codes are only ever compared, never re-read or re-sent.
        storeOTP: "hashed",
        sendOTP: async ({ user, otp }) => {
          await sendTwoFactorOtpEmail({
            to: user.email,
            code: otp,
            name: user.name,
            expiresInMinutes: TWO_FACTOR_OTP_EXPIRES_IN_MINUTES,
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
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, url, name: user.name });
    },
  },
  rateLimit: { enabled: true, storage: "secondary-storage" },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url, token }) => {
      const confirmation = new URL("/auth/email-confirmation", url);
      confirmation.searchParams.set("token", token);
      await sendVerificationEmail({ to: user.email, url: confirmation.toString(), name: user.name });
    },
  },
});
