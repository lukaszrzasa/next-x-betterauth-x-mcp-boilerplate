import "server-only";

import { eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, user } from "@/src/lib/db";
import { UNNAMED_USER_LABEL, clipText } from "@/app/(LogsModule)/_/derivation";
import { LOG_LIMITS } from "@/app/(LogsModule)/_/schema";
import type { AuditOutcome, EntitySnapshot } from "@/app/(LogsModule)/_/types";

/**
 * How this module names its accounts in the audit log: a `user` entity
 * snapshot with the account's display name at event time. The logs module
 * stores what it is given and never looks an account up; the lookup below
 * is this module reading its own table.
 */

/** A user snapshot from an account already loaded by the caller. */
export function userEntity(account: { id: string; name: string | null | undefined }): EntitySnapshot {
  const name = (account.name ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
  return {
    type: "user",
    id: account.id,
    label: name.length > 0 ? clipText(name, LOG_LIMITS.labelLength) : UNNAMED_USER_LABEL,
  };
}

/**
 * A user snapshot by ID, for a refusal recorded before the operation loaded
 * its target. An account that does not exist keeps its ID with a label that
 * says so, rather than a fabricated name.
 */
export async function userEntityById(userId: string): Promise<EntitySnapshot> {
  const [row] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return row ? userEntity(row) : { type: "user", id: userId, label: UNKNOWN_USER_LABEL };
}

export const UNKNOWN_USER_LABEL = "Unknown user";

/** The operation-level subject of an admin action on one account (`{ userId }` input). */
export const targetUserSubject = (_ctx: AuthedCtx, input: { userId: string } | null) =>
  input === null ? null : userEntityById(input.userId);

/** The subject of a self-service action: the signed-in account itself. */
export const selfSubject = (ctx: AuthedCtx) => userEntity(ctx.user);

/**
 * The outcome of an event with follow-up effects: with a committed write, a
 * failed effect makes it `partial`; without one the effects are the event -
 * all of them failing is `failed`, some is `partial`.
 */
export function effectsOutcome(
  effects: { attempted: number; failed: number; committed: boolean } | undefined,
): AuditOutcome {
  if (!effects || effects.failed === 0) return "succeeded";
  if (effects.committed) return "partial";
  return effects.failed >= effects.attempted ? "failed" : "partial";
}
