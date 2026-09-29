import "server-only";

import { and, eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, twoFactor, user } from "@/src/lib/db";

export type FactorRow = typeof twoFactor.$inferSelect;

export type FactorAccount = {
  id: string;
  email: string;
  role: string | null;
  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;
};

/** The provider's factor row for the actor (at most one), verified or still pending. */
export async function findFactor(ctx: AuthedCtx): Promise<FactorRow | null> {
  const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, ctx.user.id)).limit(1);
  return row ?? null;
}

/** The actor's factor state as it is now, never the session's cached copy. */
export async function findFactorAccount(ctx: AuthedCtx): Promise<FactorAccount | null> {
  const [row] = await db
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      twoFactorRequired: user.twoFactorRequired,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.id, ctx.user.id))
    .limit(1);
  return row ? { ...row, twoFactorEnabled: row.twoFactorEnabled === true } : null;
}

/** Removes the actor's factor row only while it is still unverified. */
export async function deleteUnverifiedFactor(ctx: AuthedCtx, factorId: string): Promise<void> {
  await db
    .delete(twoFactor)
    .where(and(eq(twoFactor.id, factorId), eq(twoFactor.userId, ctx.user.id), eq(twoFactor.verified, false)));
}
