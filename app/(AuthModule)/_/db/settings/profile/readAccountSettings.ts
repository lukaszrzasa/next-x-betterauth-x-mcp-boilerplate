import "server-only";

import { eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, user } from "@/src/lib/db";
import { loadPendingEmailRequest } from "@/app/(AuthModule)/_/db/settings/emailChange/loadPendingEmailRequest";
import { accountNotFoundError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { enrollmentRequiredFor } from "@/app/(AuthModule)/_/db/settings/twoFactor/factors";
import type { AccountSettings } from "@/app/(AuthModule)/_/types/settings";

/** The Account page: sign-in email and its pending request, and the authenticator state and policy. */
export async function readAccountSettings(ctx: AuthedCtx): Promise<AccountSettings> {
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
  if (!row) throw accountNotFoundError();

  const emailVerified = row.emailVerified === true;
  return {
    email: row.email,
    emailVerified,
    twoFactorEnabled: row.twoFactorEnabled === true,
    twoFactorRequired: enrollmentRequiredFor(row),
    pendingEmail: await loadPendingEmailRequest(ctx, { id: row.id, email: row.email, emailVerified }),
  };
}
