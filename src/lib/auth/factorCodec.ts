import "server-only";

import { createHash } from "node:crypto";
import { createOTP } from "@better-auth/utils/otp";
import { generateRandomString, symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

import { appName } from "@/src/lib/config";
import { auth } from "./index";
import { TOTP_PERIOD_SECONDS } from "./stepUpPolicy";

/**
 * The narrow compatibility seam between the staged authenticator
 * replacement and the installed provider's own factor storage. Everything
 * here mirrors what `better-auth`'s two-factor plugin does with its public
 * exports, so a secret or recovery-code set produced here is indistinguishable
 * from one the provider produced: verified by the real provider login tests.
 *
 * - secrets: `generateRandomString(32)`, encrypted with `symmetricEncrypt`
 *   under the provider's `secretConfig`;
 * - codes: `createOTP(secret, { digits: 6, period })`, window 1;
 * - recovery codes: ten unique 10-character alphanumeric strings formatted
 *   `xxxxx-xxxxx`, stored as `symmetricEncrypt(JSON.stringify(codes))`.
 *
 * No private package path is imported.
 */

const TOTP_DIGITS = 6;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;

async function encryptionKey() {
  return (await auth.$context).secretConfig;
}

/** A fresh raw secret in the provider's own format (the value the URI encodes). */
export function generateFactorSecret(): string {
  return generateRandomString(32);
}

export async function encryptFactorSecret(secret: string): Promise<string> {
  return symmetricEncrypt({ key: await encryptionKey(), data: secret });
}

export async function decryptFactorSecret(encrypted: string): Promise<string> {
  return symmetricDecrypt({ key: await encryptionKey(), data: encrypted });
}

/** Identifies a stored (encrypted) factor without ever exposing it. */
export function fingerprintEncryptedSecret(encrypted: string): string {
  return createHash("sha256").update(encrypted).digest("hex");
}

/** The `otpauth://` URI for a raw secret; the helper base32-encodes it exactly once. */
export function totpUriFor(secret: string, accountLabel: string): string {
  return createOTP(secret, { digits: TOTP_DIGITS, period: TOTP_PERIOD_SECONDS }).url(appName, accountLabel);
}

/** The manual setup key is the URI's own `secret` parameter, never re-encoded. */
export function manualKeyFromUri(totpUri: string): string {
  const secret = new URL(totpUri).searchParams.get("secret");
  if (!secret) throw new Error("The authenticator URI carries no secret.");
  return secret;
}

/** Verifies a six-digit code against a raw secret with the provider's window of one step. */
export function verifyFactorCode(secret: string, code: string): Promise<boolean> {
  return createOTP(secret, { digits: TOTP_DIGITS, period: TOTP_PERIOD_SECONDS }).verify(code, {
    window: 1,
  });
}

/** Ten unique codes in the provider's `xxxxx-xxxxx` format. */
export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) {
    const raw = generateRandomString(RECOVERY_CODE_LENGTH, "a-z", "0-9", "A-Z");
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return [...codes];
}

/** The provider's `storeBackupCodes: "encrypted"` representation. */
export async function encryptRecoveryCodes(codes: readonly string[]): Promise<string> {
  return symmetricEncrypt({ key: await encryptionKey(), data: JSON.stringify(codes) });
}

/** Reads a stored set back, only ever inside a completion service that presents it once. */
export async function decryptRecoveryCodes(encrypted: string): Promise<string[]> {
  const parsed: unknown = JSON.parse(await symmetricDecrypt({ key: await encryptionKey(), data: encrypted }));
  if (!Array.isArray(parsed) || parsed.some((code) => typeof code !== "string")) {
    throw new Error("Stored recovery codes are not in the expected format.");
  }
  return parsed as string[];
}
