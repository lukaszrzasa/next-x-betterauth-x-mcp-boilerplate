import "server-only";

import { ActionError } from "@/src/lib/auth/errors";
import type { RateLimitedData, UserActionDenial, UserFieldError } from "./types";

/** The refusals of user administration, with the typed `data` the detail page reads. */

export const DENIAL_MESSAGES: Record<UserActionDenial, string> = {
  permission: "You do not have permission to do this.",
  "root-protected": "The root account can only be changed by the root account.",
  "root-self-limit": "This change is not available for the root account.",
  self: "You cannot administer your own account here.",
  "staff-target": "Changing a staff account requires the manage-staff permission.",
  "already-verified": "This email address is already verified.",
  "not-banned": "This user is not banned.",
};

export const denialError = (reason: UserActionDenial | undefined) =>
  new ActionError("FORBIDDEN", { message: DENIAL_MESSAGES[reason ?? "permission"], data: { reason } });

export const targetNotFoundError = (cause?: unknown) =>
  new ActionError("NOT_FOUND", { message: "This user no longer exists.", cause });

export function emailInUseError(cause: unknown): ActionError {
  const data: UserFieldError = { field: "email", code: "EMAIL_IN_USE" };
  return new ActionError("CONFLICT", { message: "Another account already uses this email address.", data, cause });
}

export const lastAdminError = () =>
  new ActionError("FORBIDDEN", {
    message: "This is the last active admin account; it cannot be banned.",
    data: { reason: "last-admin" },
  });

export function rateLimitedError(retryAfterSeconds: number): ActionError {
  const data: RateLimitedData = { retryAfterSeconds };
  return new ActionError("RATE_LIMITED", {
    message: `Please wait ${retryAfterSeconds} seconds before sending another email to this user.`,
    data,
  });
}
