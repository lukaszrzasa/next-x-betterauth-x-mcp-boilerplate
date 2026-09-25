import "server-only";

import { auth } from "@/src/lib/auth";
import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db } from "@/src/lib/db";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import type { UserTargetSchema } from "@/app/(AuthModule)/admin/_/schema";
import type { UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { unchanged } from "./outcomes";
import { authorizeTargetAction } from "./targets";
import { consumeAdminEmailAttempt } from "./throttle";

/**
 * The provider requests behind the two email actions. Both take the target's
 * current address as freshly loaded by the caller, never as browser input,
 * and both reuse the application's configured templates and links: the
 * verification email goes through `emailVerification.sendVerificationEmail`
 * (the app's confirmation page), the reset email through
 * `emailAndPassword.sendResetPassword` with the app's reset page as the
 * callback. A resolved promise means the provider accepted the request, not
 * that anything reached an inbox.
 */

/**
 * Deliberately without the actor's headers: with a session attached, Better
 * Auth insists the address is the session's own and refuses anyone else's.
 * Authorization already happened in the guarded operation.
 */
export async function requestVerificationEmail(_ctx: AuthedCtx, email: string): Promise<void> {
  await auth.api.sendVerificationEmail({ body: { email } });
}

/** No step-up: the public forgot-password flow already exists; this only targets it. */
export async function requestPasswordResetEmail(_ctx: AuthedCtx, email: string): Promise<void> {
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: authRoutes.resetPassword.href },
  });
}

export async function sendVerification(
  ctx: AuthedCtx,
  input: UserTargetSchema,
): Promise<UserMutationOutcome> {
  const { target, unchanged: verified } = await authorizeTargetAction(
    ctx,
    db,
    input.userId,
    "sendVerification",
  );
  if (verified) return unchanged(target.id);

  await consumeAdminEmailAttempt(ctx, "verification", target.id);
  await requestVerificationEmail(ctx, target.email);
  // TODO(audit): Persist users.verification.requested after the provider accepted
  // the request (accepted, not delivered). Include ctx.requestId, actor user ID,
  // target user ID, UTC time and outcome. Never include tokens or links.
  return { status: "completed", userId: target.id };
}

export async function sendPasswordReset(
  ctx: AuthedCtx,
  input: UserTargetSchema,
): Promise<UserMutationOutcome> {
  const { target } = await authorizeTargetAction(ctx, db, input.userId, "sendPasswordReset");

  await consumeAdminEmailAttempt(ctx, "password-reset", target.id);
  await requestPasswordResetEmail(ctx, target.email);
  // TODO(audit): Persist users.password_reset.requested after the provider
  // accepted the request (accepted, not delivered; no password, factor or
  // session changed). Include ctx.requestId, actor user ID, target user ID,
  // UTC time and outcome. Never include the reset token or link.
  return { status: "completed", userId: target.id };
}
