import "server-only";

import { randomBytes } from "node:crypto";

import { auth } from "@/src/lib/auth";
import { buildRoute } from "@/src/lib/routes";
import { sha256Hex } from "@/src/lib/sha256Hex";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/** Only the digest of a proof token is ever stored or compared. */
export const hashToken = sha256Hex;

/** 32 random bytes as base64url (43 characters), with the digest to store. */
export function issueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** The public confirmation page for a token, on the provider's base URL. */
export async function confirmationUrl(token: string): Promise<string> {
  const path = buildRoute(authRoutes.emailChangeConfirmation.href, undefined, { token });
  return new URL(path, (await auth.$context).baseURL).toString();
}
