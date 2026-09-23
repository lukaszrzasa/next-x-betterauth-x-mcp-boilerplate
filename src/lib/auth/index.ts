import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { ac, roles } from "./permissions";
import { TOTP_PERIOD_SECONDS } from "./2fa";

import { appName } from "@/src/lib/config";
import { db } from "@/src/lib/db";
import { redisSecondaryStorage } from "@/src/lib/redis";
import {
  sendPasswordResetEmail,
  sendTwoFactorOtpEmail,
  sendVerificationEmail,
} from "@/src/lib/email";

const TWO_FACTOR_OTP_EXPIRES_IN_MINUTES = 5;

export const auth = betterAuth({
  appName,
  user: {
    additionalFields: {
      // Policy only: enrollment enforcement will be added with the enrollment flow.
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
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, url, name: user.name });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, url, name: user.name });
    },
  },
});
