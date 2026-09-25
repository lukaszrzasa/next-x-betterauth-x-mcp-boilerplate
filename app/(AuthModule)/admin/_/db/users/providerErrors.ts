import "server-only";

import { APIError } from "better-auth/api";

import { ActionError } from "@/src/lib/auth/errors";
import type { UserFieldError } from "@/app/(AuthModule)/admin/_/types";
import { DENIAL_MESSAGES } from "./targets";

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

function emailInUseError(cause: unknown): ActionError {
  const data: UserFieldError = { field: "email", code: "EMAIL_IN_USE" };
  return new ActionError("CONFLICT", {
    message: "Another account already uses this email address.",
    data,
    cause,
  });
}

/** Provider refusals the operation's own checks should already have caught. */
export function translateProviderError(error: unknown): never {
  const code = providerErrorCode(error);
  if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" || code === "USER_ALREADY_EXISTS") {
    throw emailInUseError(error);
  }
  if (code === "USER_NOT_FOUND") {
    throw new ActionError("NOT_FOUND", { message: "This user no longer exists.", cause: error });
  }
  if (code?.startsWith("YOU_ARE_NOT_ALLOWED") || code === "YOU_CANNOT_BAN_YOURSELF") {
    throw new ActionError("FORBIDDEN", { message: DENIAL_MESSAGES.permission, cause: error });
  }
  if ((error as { code?: unknown } | null)?.code === "23505") {
    // A unique violation the provider's own pre-check raced past.
    throw emailInUseError(error);
  }
  throw error;
}
