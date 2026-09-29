import "server-only";

import { eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, user } from "@/src/lib/db";

/** The actor's display name, from the current row. */
export async function findProfile(ctx: AuthedCtx): Promise<{ name: string } | null> {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
  return row ?? null;
}

export type AccountRow = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;
};

/** What the Account page is built from: the sign-in address and the factor state, from the current row. */
export async function findAccount(ctx: AuthedCtx): Promise<AccountRow | null> {
  const [row] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      twoFactorRequired: user.twoFactorRequired,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.id, ctx.user.id))
    .limit(1);
  if (!row) return null;
  return { ...row, emailVerified: row.emailVerified === true, twoFactorEnabled: row.twoFactorEnabled === true };
}
