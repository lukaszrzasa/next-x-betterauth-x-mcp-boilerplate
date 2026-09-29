import "server-only";

import { APIError } from "better-auth/api";

import { ActionError } from "@/src/lib/auth/errors";
import { uniqueViolationConstraint } from "@/src/lib/postgresErrors";
import { DENIAL_MESSAGES, emailInUseError, targetNotFoundError } from "@/app/(AuthModule)/admin/_/errors";

/**
 * Better Auth refusals the operations' own checks should already have
 * caught, translated into the application's typed errors; anything else
 * propagates and becomes an opaque INTERNAL result.
 */

function providerErrorCode(error: unknown): string | undefined {
  if (!(error instanceof APIError)) return undefined;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

/** The constraint PostgreSQL arbitrates a concurrent claim of the same address with. */
const USER_EMAIL_UNIQUE = "user_email_unique";

export function translateProviderError(error: unknown): never {
  const code = providerErrorCode(error);
  if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" || code === "USER_ALREADY_EXISTS") {
    throw emailInUseError(error);
  }
  if (code === "USER_NOT_FOUND") throw targetNotFoundError(error);
  if (code?.startsWith("YOU_ARE_NOT_ALLOWED") || code === "YOU_CANNOT_BAN_YOURSELF") {
    throw new ActionError("FORBIDDEN", { message: DENIAL_MESSAGES.permission, cause: error });
  }
  // A unique violation the provider's own pre-check raced past.
  if (uniqueViolationConstraint(error) === USER_EMAIL_UNIQUE) throw emailInUseError(error);
  throw error;
}
