import "server-only";

import { and, count, eq, not, type InferSelectModel } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, installation, user } from "@/src/lib/db";
import { effectivelyBanned, hasRoleToken } from "./predicates";

/**
 * What a mutation needs to know about the account it acts on, read fresh
 * on every invocation and never fed browser data.
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

export type TargetRow = Pick<InferSelectModel<typeof user>, keyof typeof targetColumns>;

export async function findTargetRow(_ctx: AuthedCtx, userId: string): Promise<TargetRow | null> {
  const [row] = await db.select(targetColumns).from(user).where(eq(user.id, userId)).limit(1);
  return row ?? null;
}

/** The installation's root user ID, or `null` while no installation record exists. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every service entry takes the context
export async function findRootUserId(_ctx: AuthedCtx): Promise<string | null> {
  const [row] = await db.select({ rootUserId: installation.rootUserId }).from(installation).limit(1);
  return row?.rootUserId ?? null;
}

/** How many accounts hold the admin role and are not effectively banned at `asOf`. */
export async function countUnbannedAdmins(_ctx: AuthedCtx, asOf: Date): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(user)
    .where(and(hasRoleToken("admin"), not(effectivelyBanned(asOf))));
  return total;
}
