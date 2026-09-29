import "server-only";

import { APIError } from "better-auth/api";

import { incorrectPasswordError } from "@/app/(AuthModule)/_/errors/settings";

/** The provider's machine-readable error code, when the error is one of its API errors. */
export function providerErrorCode(error: unknown): string | undefined {
  if (!(error instanceof APIError)) return undefined;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Rethrows a wrong-password refusal from a provider call as the field error; anything else unchanged. */
export function rethrowProviderPasswordError(error: unknown): never {
  if (providerErrorCode(error) === "INVALID_PASSWORD") throw incorrectPasswordError(error);
  throw error;
}
