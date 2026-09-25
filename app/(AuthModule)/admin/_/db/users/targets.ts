import "server-only";

import { eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import { db, user } from "@/src/lib/db";
import {
  effectiveAccessStatus,
  evaluateUserAction,
  type PolicyTarget,
} from "@/app/(AuthModule)/admin/_/policy";
import type { UserAction, UserActionDenial } from "@/app/(AuthModule)/admin/_/types";
import { requireRootUserId } from "./reads";

/**
 * Loading a mutation's target and deciding the target policy from fresh
 * rows. Shared by every write in this directory; never fed browser data.
 */

const targetColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
  banned: user.banned,
  banExpires: user.banExpires,
  banReason: user.banReason,
};

export type Target = PolicyTarget & {
  name: string;
  email: string;
  banExpires: Date | null;
  banReason: string | null;
};

export async function loadTarget(reads: Pick<typeof db, "select">, userId: string): Promise<Target> {
  const [row] = await reads.select(targetColumns).from(user).where(eq(user.id, userId)).limit(1);
  if (!row) {
    throw new ActionError("NOT_FOUND", { message: "This user no longer exists." });
  }
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

export const DENIAL_MESSAGES: Record<UserActionDenial, string> = {
  permission: "You do not have permission to do this.",
  "root-protected": "The root account can only be changed by the root account.",
  "root-self-limit": "This change is not available for the root account.",
  self: "You cannot administer your own account here.",
  "staff-target": "Changing a staff account requires the manage-staff permission.",
  "already-verified": "This email address is already verified.",
  "not-banned": "This user is not banned.",
};

/** Denials that mean "nothing to do" for an idempotent action rather than a refusal. */
const NO_CHANGE_DENIALS: Partial<Record<UserAction, UserActionDenial>> = {
  sendVerification: "already-verified",
  unban: "not-banned",
};

export type Authorized = { target: Target; rootUserId: string; unchanged: boolean };

/**
 * Root ID, target and policy from the same fresh reads. Returns
 * `unchanged: true` when the action's idempotent no-op reason applies
 * (nothing to send, nothing to lift) and throws for every other denial.
 */
export async function authorizeTargetAction(
  ctx: AuthedCtx,
  reads: Pick<typeof db, "select">,
  userId: string,
  action: UserAction,
): Promise<Authorized> {
  const [rootUserId, target] = await Promise.all([
    requireRootUserId(reads),
    loadTarget(reads, userId),
  ]);
  const decision = evaluateUserAction(
    { id: ctx.user.id, role: ctx.user.role },
    target,
    rootUserId,
    action,
  );
  if (decision.allowed) return { target, rootUserId, unchanged: false };
  if (decision.reason && decision.reason === NO_CHANGE_DENIALS[action]) {
    return { target, rootUserId, unchanged: true };
  }
  throw new ActionError("FORBIDDEN", {
    message: DENIAL_MESSAGES[decision.reason ?? "permission"],
    data: { reason: decision.reason },
  });
}
