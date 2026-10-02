import "server-only";

import { fieldError, lifecycleError } from "./settings";

export const setupReplacedError = () =>
  lifecycleError("CONFLICT", "SETUP_REPLACED", { key: "auth.errors.setupReplaced" });

export const setupExpiredError = () =>
  lifecycleError("CONFLICT", "EXPIRED", { key: "auth.errors.setupExpired" });

export const invalidCodeError = () =>
  fieldError("INVALID_INPUT", "code", "INVALID_CODE", { key: "auth.errors.invalidAuthenticatorCode" });
