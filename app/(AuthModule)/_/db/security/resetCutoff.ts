import "server-only";

import { eq } from "drizzle-orm";

import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { db, user } from "@/src/lib/db";

/**
 * The instant before which the account's reset links no longer count, or
 * `null` for an account that does not exist. `cutoff` itself is null for an
 * account that never had one.
 */
export async function findResetCutoff(_ctx: PublicCtx, userId: string): Promise<{ cutoff: Date | null } | null> {
  const [row] = await db
    .select({ cutoff: user.passwordResetInvalidBefore })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? null;
}
