import "server-only";

import { eq } from "drizzle-orm";

import { needsTwoFactorEnrollment } from "@/src/lib/auth/enrollment";
import { fingerprintEncryptedSecret } from "@/src/lib/auth/factorCodec";
import type { SqlReader } from "@/src/lib/auth/securityVersion";
import { twoFactor, user, type authenticatorSetupRequest } from "@/src/lib/db";
import { accountNotFoundError } from "@/app/(AuthModule)/_/db/settings/shared/errors";

export type FactorRow = typeof twoFactor.$inferSelect;

export type FactorAccount = {
  id: string;
  email: string;
  role: string | null;
  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;
};

/** The provider's factor row for the account (at most one), verified or still pending. */
export async function findFactor(reads: SqlReader, userId: string): Promise<FactorRow | null> {
  const [row] = await reads.select().from(twoFactor).where(eq(twoFactor.userId, userId)).limit(1);
  return row ?? null;
}

/** The account's factor state as it is now, never the session's cached copy. */
export async function loadFactorAccount(reads: SqlReader, userId: string): Promise<FactorAccount> {
  const [row] = await reads
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      twoFactorRequired: user.twoFactorRequired,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) throw accountNotFoundError();
  return { ...row, twoFactorEnabled: row.twoFactorEnabled === true };
}

/** Whether policy requires this account to keep an authenticator: fresh role and stored flag. */
export function enrollmentRequiredFor(row: { role: string | null; twoFactorRequired: boolean }): boolean {
  return needsTwoFactorEnrollment({ role: row.role, twoFactorRequired: row.twoFactorRequired, twoFactorEnabled: false });
}

type SetupBinding = Pick<typeof authenticatorSetupRequest.$inferSelect, "currentFactorId" | "currentFactorFingerprint">;

/** Whether `factor` is still the exact row (and secret) a setup attempt was started against. */
export function isFactorOfSetup(factor: FactorRow | null, setup: SetupBinding): factor is FactorRow {
  return (
    factor !== null &&
    factor.id === setup.currentFactorId &&
    fingerprintEncryptedSecret(factor.secret) === setup.currentFactorFingerprint
  );
}
