import "server-only";

import { ActionError } from "@/src/lib/auth/errors";
import type { MessageKey } from "@/src/lib/i18n/messageKey";
import type { RateLimitedData, UserActionDenial, UserFieldError } from "./types";

/**
 * The refusals of user administration, with the typed `data` the detail page
 * reads. Each names its text as a catalog key; the boundary adapter renders
 * it in the request's locale.
 */

export const DENIAL_MESSAGE_KEYS: Record<UserActionDenial, MessageKey> = {
  permission: "authAdmin.errors.denial.permission",
  "root-protected": "authAdmin.errors.denial.rootProtected",
  "root-self-limit": "authAdmin.errors.denial.rootSelfLimit",
  self: "authAdmin.errors.denial.self",
  "staff-target": "authAdmin.errors.denial.staffTarget",
  "already-verified": "authAdmin.errors.denial.alreadyVerified",
  "not-banned": "authAdmin.errors.denial.notBanned",
};

export const denialError = (reason: UserActionDenial | undefined) =>
  new ActionError("FORBIDDEN", { message: { key: DENIAL_MESSAGE_KEYS[reason ?? "permission"] }, data: { reason } });

export const targetNotFoundError = (cause?: unknown) =>
  new ActionError("NOT_FOUND", { message: { key: "authAdmin.errors.targetNotFound" }, cause });

export function emailInUseError(cause: unknown): ActionError {
  const data: UserFieldError = { field: "email", code: "EMAIL_IN_USE" };
  return new ActionError("CONFLICT", { message: { key: "authAdmin.errors.emailInUse" }, data, cause });
}

export const lastAdminError = () =>
  new ActionError("FORBIDDEN", {
    message: { key: "authAdmin.errors.lastAdmin" },
    data: { reason: "last-admin" },
  });

export function rateLimitedError(retryAfterSeconds: number): ActionError {
  const data: RateLimitedData = { retryAfterSeconds };
  return new ActionError("RATE_LIMITED", {
    message: { key: "authAdmin.errors.rateLimited", values: { seconds: retryAfterSeconds } },
    data,
  });
}
