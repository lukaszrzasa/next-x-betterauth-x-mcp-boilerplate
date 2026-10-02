import "server-only";

import { fieldError, lifecycleError } from "./settings";

export const inactiveRequestError = () =>
  lifecycleError("NOT_FOUND", "INACTIVE", { key: "auth.errors.emailRequestInactive" });

export const expiredRequestError = () =>
  lifecycleError("CONFLICT", "EXPIRED", { key: "auth.errors.emailRequestExpired" });

export const addressUnavailableError = (cause?: unknown) =>
  fieldError("CONFLICT", "newEmail", "EMAIL_UNAVAILABLE", { key: "auth.errors.emailUnavailable" }, cause);

export const addressUnchangedError = () =>
  fieldError("INVALID_INPUT", "newEmail", "EMAIL_UNCHANGED", { key: "auth.errors.emailUnchanged" });
