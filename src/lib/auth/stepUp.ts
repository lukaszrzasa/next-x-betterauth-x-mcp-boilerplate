import "server-only";

import { createHash, randomInt } from "node:crypto";
import { APIError } from "better-auth/api";
import { z } from "zod";

import { auth } from "./index";
import {
  DEFAULT_POOL,
  TOTP_PERIOD_SECONDS,
  grantTtlSeconds,
  satisfyingLevels,
  twoFactorPools,
  type Importance,
  type StepUpMethod,
  type TwoFactorPoolName,
} from "./2fa";
import { ActionError } from "./errors";
import { VERIFY_EMAIL_CHALLENGE } from "./emailChallenge";
import { sendTwoFactorOtpEmail } from "@/src/lib/email";
import { incrementWithTtl, redis } from "@/src/lib/redis";

type SessionUser = (typeof auth.$Infer.Session)["user"];

/* ---------------------------------------------------------------------------
 * Keys
 *
 * Everything is scoped to `userId:sessionId`, never to the user alone: a
 * verification performed on a laptop must not silently unlock a session stolen
 * from a phone. The userId is included so a recycled session id cannot inherit
 * a previous session's state.
 * ------------------------------------------------------------------------- */

type Scope = { userId: string; sessionId: string };

const scopeOf = ({ userId, sessionId }: Scope) => `${userId}:${sessionId}`;

const grantKey = (scope: Scope, level: Importance) =>
  `stepup:lvl:${scopeOf(scope)}:${level}`;
const onceKey = (scope: Scope, pool: TwoFactorPoolName) =>
  `stepup:once:${scopeOf(scope)}:${pool}`;
const challengeKey = (scope: Scope) => `stepup:chal:${scopeOf(scope)}`;
const failureKey = (scope: Scope) => `stepup:fail:${scopeOf(scope)}`;

/* ---------------------------------------------------------------------------
 * Attempt limiting
 *
 * Better Auth's own lockout and per-code attempt counters run only on the
 * sign-in path - mid-session verification gets `isSignIn === false` and skips
 * every one of them. The sole remaining brake is a 3-request/10s path limit, so
 * the budget below is ours to enforce.
 * ------------------------------------------------------------------------- */

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_SECONDS = 15 * 60;

/** Per session rather than per user, so a stolen session cannot lock the owner out. */
async function assertNotLocked(scope: Scope) {
  const failures = Number(await redis.get(failureKey(scope))) || 0;

  if (failures >= MAX_FAILED_ATTEMPTS) {
    throw new ActionError("STEP_UP_LOCKED", {
      message: "Too many failed verification attempts. Try again later.",
    });
  }
}

async function recordFailure(scope: Scope) {
  await incrementWithTtl(failureKey(scope), LOCK_DURATION_SECONDS);
}

async function clearFailures(scope: Scope) {
  await redis.del(failureKey(scope));
}

/* ---------------------------------------------------------------------------
 * Grants
 * ------------------------------------------------------------------------- */

/**
 * Whether `pool` is already satisfied, consuming the verification if the pool
 * is consume-once.
 *
 * Reads walk from the pool's own importance upward: any verification at least
 * as strong counts, judged against *this* pool's window rather than the window
 * of whatever pool it was created for.
 */
export async function hasGrant(
  scope: Scope,
  pool: TwoFactorPoolName,
): Promise<boolean> {
  const config = twoFactorPools[pool];

  if (config.consumeOnce) {
    // GETDEL: two concurrent actions cannot both spend the same verification.
    const raw = await redis.getdel(onceKey(scope, pool));
    return isFresh(raw, config.timeWindow);
  }

  const values = await redis.mget(
    ...satisfyingLevels(config).map((level) => grantKey(scope, level)),
  );

  return values.some((raw) => isFresh(raw, config.timeWindow));
}

function isFresh(raw: string | null, windowSeconds: number): boolean {
  if (!raw) return false;

  const verifiedAt = Number(raw);
  if (!Number.isFinite(verifiedAt)) return false;

  const age = Date.now() - verifiedAt;
  return age >= 0 && age <= windowSeconds * 1000;
}

async function writeGrant(scope: Scope, pool: TwoFactorPoolName) {
  const config = twoFactorPools[pool];
  const now = `${Date.now()}`;

  if (config.consumeOnce) {
    await redis.set(onceKey(scope, pool), now, "EX", config.timeWindow);
    return;
  }

  await redis.set(
    grantKey(scope, config.importance),
    now,
    "EX",
    grantTtlSeconds(config.importance),
  );
}

/* ---------------------------------------------------------------------------
 * Methods
 * ------------------------------------------------------------------------- */

/**
 * `twoFactorEnabled` is only ever set alongside `twoFactor.verified`, so it is
 * a safe stand-in for "has a usable authenticator secret" without a second
 * query - and checking it is what keeps us out of Better Auth's enroll-and-
 * rotate-session branch, which would delete the session our grant is keyed to.
 */
export function availableMethods(user: SessionUser): readonly StepUpMethod[] {
  const methods: StepUpMethod[] = [];

  if (user.twoFactorEnabled) methods.push("totp");
  // An unverified address is not a second factor - it may be attacker-supplied.
  if (user.emailVerified) methods.push("email");

  return methods;
}

/* ---------------------------------------------------------------------------
 * Email challenge
 *
 * Owned here rather than delegated to Better Auth's `/two-factor/send-otp`,
 * whose verify step silently sets `twoFactorEnabled` and replaces the session
 * for a user who has not enrolled. That rotation would orphan the grant we are
 * about to write against the old session id, and the client would retry forever.
 * ------------------------------------------------------------------------- */

const CHALLENGE_DIGITS = 6;
const CHALLENGE_TTL_SECONDS = 5 * 60;

const hash = (code: string) => createHash("sha256").update(code).digest();

/** Sends a fresh code, replacing any outstanding one for this session. */
export async function issueEmailChallenge(
  user: SessionUser,
  scope: Scope,
): Promise<void> {
  await assertNotLocked(scope);

  if (!user.emailVerified) {
    throw new ActionError("EMAIL_VERIFICATION_REQUIRED", {
      message:
        "Verify your email address before using email verification codes.",
    });
  }

  // This helper is now client-callable: bound email sends on the server too.
  const allowed = await redis.set(
    `stepup:send:${scopeOf(scope)}`,
    "1",
    "EX",
    30,
    "NX",
  );
  if (allowed !== "OK") {
    throw new ActionError("RATE_LIMITED", {
      message: "Wait 30 seconds before requesting another email code.",
    });
  }

  const code = `${randomInt(0, 10 ** CHALLENGE_DIGITS)}`.padStart(
    CHALLENGE_DIGITS,
    "0",
  );

  await redis.set(
    challengeKey(scope),
    hash(code).toString("hex"),
    "EX",
    CHALLENGE_TTL_SECONDS,
  );

  await sendTwoFactorOtpEmail({
    to: user.email,
    code,
    name: user.name,
    expiresInMinutes: CHALLENGE_TTL_SECONDS / 60,
  });
}

async function verifyEmailChallenge(
  scope: Scope,
  code: string,
): Promise<boolean> {
  const result = await redis.eval(
    VERIFY_EMAIL_CHALLENGE,
    2,
    challengeKey(scope),
    failureKey(scope),
    hash(code).toString("hex"),
    MAX_FAILED_ATTEMPTS,
    LOCK_DURATION_SECONDS,
  );
  if (result === -1) {
    throw new ActionError("STEP_UP_LOCKED", {
      message: "Too many failed verification attempts. Try again later.",
    });
  }
  return result === 1;
}

/* ---------------------------------------------------------------------------
 * Verification
 * ------------------------------------------------------------------------- */

export type StepUpProof = {
  method: StepUpMethod;
  code: string;
};

const stepUpProofSchema = z.object({
  method: z.enum(["totp", "email"]),
  code: z.string().regex(/^\d{6}$/),
});

/**
 * Verifies `proof` and, on success, records a grant for `pool`.
 *
 * TOTP is delegated to Better Auth, which owns the enrolled secret. Mid-session
 * it is a pure "is this code correct?" check: it creates no session, sets no
 * cookie and stores nothing - which is precisely why the grant below is ours to
 * write.
 */
export async function verifyStepUp({
  user,
  scope,
  headers,
  proof: rawProof,
  pool = DEFAULT_POOL,
  persistGrant = true,
}: {
  user: SessionUser;
  scope: Scope;
  headers: Headers;
  proof: StepUpProof;
  pool?: TwoFactorPoolName;
  /**
   * `false` when the verification authorises the call it arrived on and nothing
   * else. The inline path uses it for consume-once pools: storing a grant there
   * would leave the code reusable for the rest of its window by a *second*
   * action, which is exactly what a one-time pool exists to prevent.
   */
  persistGrant?: boolean;
}): Promise<void> {
  // Both adapters accept untrusted data; TypeScript types do not validate it.
  const result = stepUpProofSchema.safeParse(rawProof);
  if (!result.success) {
    throw new ActionError("INVALID_INPUT", {
      message: "Step-up requires a method and a six-digit code.",
    });
  }
  const proof = result.data;
  await assertNotLocked(scope);

  if (!availableMethods(user).includes(proof.method)) {
    throw new ActionError("TWO_FACTOR_ENROLLMENT_REQUIRED", {
      message: `"${proof.method}" is not available for this account.`,
    });
  }

  const ok =
    proof.method === "totp"
      ? await verifyTotp(headers, proof.code)
      : await verifyEmailChallenge(scope, proof.code);

  if (!ok) {
    if (proof.method === "totp") await recordFailure(scope);
    throw new ActionError("STEP_UP_INVALID_CODE", {
      message: "That verification code is not valid.",
    });
  }

  if (proof.method === "totp") {
    // Better Auth accepts the previous, current and next time steps. Keep a
    // successful code spent for the full three-period window, across sessions
    // and pools, including reusable grants that could otherwise mint a second
    // one-time grant. SET NX makes concurrent verification single-use too.
    const claimed = await redis.set(
      `stepup:totp-used:${user.id}:${hash(proof.code).toString("hex")}`,
      "1",
      "EX",
      TOTP_PERIOD_SECONDS * 3,
      "NX",
    );
    if (claimed !== "OK") {
      throw new ActionError("STEP_UP_INVALID_CODE", {
        message: "That verification code has already been used.",
      });
    }
  }

  if (proof.method === "totp") await clearFailures(scope);
  if (persistGrant) await writeGrant(scope, pool);
}

async function verifyTotp(headers: Headers, code: string): Promise<boolean> {
  try {
    await auth.api.verifyTOTP({ body: { code }, headers });
    return true;
  } catch (error) {
    if (error instanceof APIError && error.body?.code === "INVALID_CODE")
      return false;
    // Database/network failures must not spend the user's wrong-code budget.
    throw error;
  }
}
