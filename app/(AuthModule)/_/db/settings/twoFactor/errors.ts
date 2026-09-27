import "server-only";

import { fieldError, lifecycleError } from "@/app/(AuthModule)/_/db/settings/shared/errors";

export const setupReplacedError = () =>
  lifecycleError("CONFLICT", "SETUP_REPLACED", "This authenticator setup is no longer active. Start the setup again.");

export const setupExpiredError = () =>
  lifecycleError("CONFLICT", "EXPIRED", "This authenticator setup has expired. Start the setup again.");

export const invalidCodeError = () =>
  fieldError("INVALID_INPUT", "code", "INVALID_CODE", "That authenticator code is not valid.");
