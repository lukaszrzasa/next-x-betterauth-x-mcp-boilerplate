import "server-only";

import { APIError } from "better-auth/api";

import { ActionError } from "@/src/lib/auth/errors";
import type {
  SettingsFieldError,
  SettingsLifecycleData,
  SettingsRateLimitedData,
} from "@/app/(AuthModule)/_/types/settings";

/**
 * The refusals settings services raise. Each carries the typed `data` its
 * client hooks read, so the UI can place a message on a field, count down a
 * rate limit or explain a lifecycle state without parsing text.
 */

export function rateLimitedError(retryAfterSeconds: number, message: string): ActionError {
  const data: SettingsRateLimitedData = { retryAfterSeconds };
  return new ActionError("RATE_LIMITED", { message, data });
}

export function fieldError(
  reason: "INVALID_INPUT" | "CONFLICT",
  field: SettingsFieldError["field"],
  code: string,
  message: string,
  cause?: unknown,
): ActionError {
  const data: SettingsFieldError = { field, code };
  return new ActionError(reason, { message, data, cause });
}

export function lifecycleError(
  reason: "CONFLICT" | "NOT_FOUND" | "FORBIDDEN",
  code: SettingsLifecycleData["code"],
  message: string,
): ActionError {
  const data: SettingsLifecycleData = { code };
  return new ActionError(reason, { message, data });
}

export const incorrectPasswordError = (cause?: unknown) =>
  fieldError("INVALID_INPUT", "currentPassword", "INCORRECT_PASSWORD", "That password is not correct.", cause);

export const accountNotFoundError = () =>
  new ActionError("NOT_FOUND", { message: "This account no longer exists." });

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

/** PostgreSQL `unique_violation`. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "23505";
}
