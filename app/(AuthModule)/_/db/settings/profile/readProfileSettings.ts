import "server-only";

import { eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, user } from "@/src/lib/db";
import { accountNotFoundError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import type { ProfileSettings } from "@/app/(AuthModule)/_/types/settings";

/** The Profile page: the display name, read from the current row. */
export async function readProfileSettings(ctx: AuthedCtx): Promise<ProfileSettings> {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
  if (!row) throw accountNotFoundError();
  return { name: row.name };
}
