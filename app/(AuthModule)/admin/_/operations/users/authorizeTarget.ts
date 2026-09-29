import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { findRootUserId, findTargetRow } from "@/app/(AuthModule)/admin/_/db/users/targets";
import { denialError, targetNotFoundError } from "@/app/(AuthModule)/admin/_/errors";
import {
  effectiveAccessStatus,
  evaluateUserAction,
  type PolicyTarget,
} from "@/app/(AuthModule)/admin/_/policy";
import type { UserAction, UserActionDenial } from "@/app/(AuthModule)/admin/_/types";

/**
 * The target of a mutation and whether the actor may act on it, decided
 * from fresh rows on every invocation. The operation's declared
 * permissions admitted the actor; this applies the rules about *this*
 * account: root, self, staff and the target's own state.
 */

export type Target = PolicyTarget & {
  name: string;
  email: string;
  banExpires: Date | null;
  banReason: string | null;
};

/** The account as it is now, with its effective access at this instant. */
export async function loadTarget(ctx: AuthedCtx, userId: string): Promise<Target> {
  const row = await findTargetRow(ctx, userId);
  if (!row) throw targetNotFoundError();
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerified: row.emailVerified === true,
    accessStatus: effectiveAccessStatus(row, new Date()),
    banExpires: row.banExpires ?? null,
    banReason: row.banReason ?? null,
  };
}

/** The installation's root user ID; its absence is a configuration failure, never a guess. */
export async function requireRootUserId(ctx: AuthedCtx): Promise<string> {
  const rootUserId = await findRootUserId(ctx);
  if (!rootUserId) throw new Error("Installation record is missing; user administration is unavailable.");
  return rootUserId;
}

/** Denials that mean "nothing to do" for an idempotent action rather than a refusal. */
const NO_CHANGE_DENIALS: Partial<Record<UserAction, UserActionDenial>> = {
  sendVerification: "already-verified",
  unban: "not-banned",
};

export type Authorized = { target: Target; unchanged: boolean };

/**
 * Returns the target the actor may act on. `unchanged: true` when the
 * action's idempotent no-op reason applies (nothing to send, nothing to
 * lift); every other denial throws.
 */
export async function authorizeTargetAction(ctx: AuthedCtx, userId: string, action: UserAction): Promise<Authorized> {
  const [rootUserId, target] = await Promise.all([requireRootUserId(ctx), loadTarget(ctx, userId)]);

  const decision = evaluateUserAction({ id: ctx.user.id, role: ctx.user.role }, target, rootUserId, action);
  if (decision.allowed) return { target, unchanged: false };
  if (decision.reason && decision.reason === NO_CHANGE_DENIALS[action]) return { target, unchanged: true };
  throw denialError(decision.reason);
}
