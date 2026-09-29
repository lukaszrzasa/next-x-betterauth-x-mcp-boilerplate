import "server-only";

import { and, eq, ne } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, user } from "@/src/lib/db";

export type EmailOwner = { id: string; email: string; emailVerified: boolean };

/** The actor's sign-in address as it is now, never the session's cached copy. */
export async function findEmailOwner(ctx: AuthedCtx): Promise<EmailOwner | null> {
  const [row] = await db
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, ctx.user.id))
    .limit(1);
  return row ?? null;
}

/** Whether an account other than the actor's signs in with `email`. */
export async function isAddressTaken(ctx: AuthedCtx, email: string): Promise<boolean> {
  const [taken] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), ne(user.id, ctx.user.id)))
    .limit(1);
  return taken !== undefined;
}
