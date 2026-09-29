import "server-only";

import { fieldError, lifecycleError } from "./settings";

export const inactiveRequestError = () =>
  lifecycleError("NOT_FOUND", "INACTIVE", "This email change request is no longer active.");

export const expiredRequestError = () =>
  lifecycleError("CONFLICT", "EXPIRED", "This email change request has expired. Start again to continue.");

export const addressUnavailableError = (cause?: unknown) =>
  fieldError("CONFLICT", "newEmail", "EMAIL_UNAVAILABLE", "This address cannot be used as your sign-in email.", cause);

export const addressUnchangedError = () =>
  fieldError("INVALID_INPUT", "newEmail", "EMAIL_UNCHANGED", "Enter a different address.");
