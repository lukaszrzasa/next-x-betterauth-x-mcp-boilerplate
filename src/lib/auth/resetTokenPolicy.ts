import "server-only";

import { BASE_ERROR_CODES } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/**
 * Password-reset links identify a user ID, not the address they were mailed
 * to. After an administrator changes an account's email, a link sent to the
 * old address would otherwise still reset the password. The account row's
 * server-owned `passwordResetInvalidBefore` marks that instant; this hook
 * refuses the completion endpoint for any token issued at or before it.
 *
 * It only inspects: `findVerificationValue` does not consume the token, so
 * the endpoint keeps its own atomic consume. Tokens issued later stay valid;
 * a token without a readable creation time fails closed and can be requested
 * again. Accounts without a cutoff are untouched. A reset already past this
 * check when the email changes is an in-flight race this hook does not claim
 * to cancel; the email change also revokes sessions and requires verification
 * of the new address.
 */

export const RESET_PASSWORD_PATH = "/reset-password";

/** The identifier the installed endpoint uses for a reset token. */
export const resetTokenIdentifier = (token: string) => `reset-password:${token}`;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** Pure decision, exported for tests. */
export function isResetTokenSuperseded(
  verification: { createdAt?: unknown },
  cutoff: unknown,
): boolean {
  const invalidBefore = toDate(cutoff);
  if (!invalidBefore) return false;
  const createdAt = toDate(verification.createdAt);
  // A cutoff exists and the token's age cannot be established: fail closed.
  if (!createdAt) return true;
  return createdAt.getTime() <= invalidBefore.getTime();
}

export const rejectSupersededResetTokens = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== RESET_PASSWORD_PATH) return;

  // Resolved exactly as the installed endpoint resolves it.
  const body = ctx.body as { token?: unknown } | undefined;
  const query = ctx.query as { token?: unknown } | undefined;
  const token = body?.token || query?.token;
  if (typeof token !== "string" || token.length === 0) return; // The endpoint answers.

  const verification = await ctx.context.internalAdapter.findVerificationValue(
    resetTokenIdentifier(token),
  );
  if (!verification) return; // The endpoint answers with INVALID_TOKEN.

  const user = await ctx.context.internalAdapter.findUserById(verification.value);
  const cutoff = (user as { passwordResetInvalidBefore?: unknown } | null)
    ?.passwordResetInvalidBefore;

  if (isResetTokenSuperseded(verification, cutoff)) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_TOKEN);
  }
});
