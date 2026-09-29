import { needsTwoFactorEnrollment } from "@/src/lib/auth/enrollment";
import { fingerprintEncryptedSecret } from "@/src/lib/auth/factorCodec";
import type { FactorRow } from "@/app/(AuthModule)/_/db/authenticator/factors";
import type { SetupRequestRow } from "@/app/(AuthModule)/_/db/authenticator/setupRequests";

/** Whether policy requires this account to keep an authenticator: fresh role and stored flag. */
export function enrollmentRequiredFor(account: { role: string | null; twoFactorRequired: boolean }): boolean {
  return needsTwoFactorEnrollment({
    role: account.role,
    twoFactorRequired: account.twoFactorRequired,
    twoFactorEnabled: false,
  });
}

type SetupBinding = Pick<SetupRequestRow, "currentFactorId" | "currentFactorFingerprint">;

/** Whether `factor` is still the exact row (and secret) a setup attempt was started against. */
export function isFactorOfSetup(factor: FactorRow | null, setup: SetupBinding): factor is FactorRow {
  return (
    factor !== null &&
    factor.id === setup.currentFactorId &&
    fingerprintEncryptedSecret(factor.secret) === setup.currentFactorFingerprint
  );
}
