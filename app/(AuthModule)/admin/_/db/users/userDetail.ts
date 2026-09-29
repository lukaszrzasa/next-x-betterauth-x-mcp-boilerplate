import "server-only";

import { eq, type InferSelectModel } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, user } from "@/src/lib/db";
import { listColumns } from "./listUsers";

const detailColumns = {
  ...listColumns,
  updatedAt: user.updatedAt,
  banReason: user.banReason,
  twoFactorRequired: user.twoFactorRequired,
  twoFactorEnabled: user.twoFactorEnabled,
};

export type UserDetailRow = Pick<InferSelectModel<typeof user>, keyof typeof detailColumns>;

/** The detail page's columns for one account, or `null` for an unknown ID. */
export async function findUserDetailRow(_ctx: AuthedCtx, userId: string): Promise<UserDetailRow | null> {
  const [row] = await db.select(detailColumns).from(user).where(eq(user.id, userId)).limit(1);
  return row ?? null;
}
