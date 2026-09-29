import { TOTP_PERIOD_SECONDS } from "@/src/lib/auth/stepUpPolicy";

/**
 * Every limit the settings operations enforce, in one place and in one
 * shape: a fixed window is `{ limit, windowSeconds }`, a lifetime is a
 * duration. Redis enforces them (`services/throttleKeys.ts` names the
 * counters); PostgreSQL holds the lifecycles they protect.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const SECOND_MS = 1_000;

export type FixedWindow = { readonly limit: number; readonly windowSeconds: number };

/** Wrong current passwords before settings refuse further attempts. */
export const CURRENT_PASSWORD_FAILURES: FixedWindow = { limit: 5, windowSeconds: 15 * MINUTE };

export const EMAIL_CHANGE_POLICY = {
  /** One fixed deadline per request; resends never move it. */
  requestTtlMs: 24 * HOUR * SECOND_MS,
  initiations: { limit: 5, windowSeconds: HOUR },
  /** Per purpose (current or new mailbox). */
  sendCooldownSeconds: MINUTE,
  /** Across every settings email flow of one account. */
  sends: { limit: 10, windowSeconds: HOUR },
  proofAttemptsPerRequest: { limit: 30, windowSeconds: 10 * MINUTE },
  /** Tokens that match no request, per client IP. */
  unknownProofsPerIp: { limit: 60, windowSeconds: 10 * MINUTE },
  verificationResendCooldownSeconds: MINUTE,
} as const satisfies Record<string, number | FixedWindow>;

export const AUTHENTICATOR_SETUP_POLICY = {
  setupTtlMs: 10 * MINUTE * SECOND_MS,
  initiations: { limit: 5, windowSeconds: HOUR },
  /** Wrong codes per attempt; reloading the QR code resets nothing. */
  codeAttempts: { limit: 5, windowSeconds: 15 * MINUTE },
  /** How long a spent code stays refused: its own step and both drift windows. */
  spentCodeSeconds: TOTP_PERIOD_SECONDS * 3,
} as const satisfies Record<string, number | FixedWindow>;
