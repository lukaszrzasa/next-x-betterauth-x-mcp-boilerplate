import { z } from "zod";
import type { MessageKey } from "@/src/lib/i18n/messageKey";
import type { ActionFailure } from "./types";

/**
 * Plain-language text for every way an action can refuse or fail, keyed by
 * the shared `ActionError` reasons (not by any provider's errors). The
 * server already localized `error.message` for refusals that explain
 * themselves; the titles and the opaque failures come from the `errors`
 * namespace of the catalog. Feature code layers its own field-level
 * handling on top; this is the fallback.
 */

export type FailureDescription = {
  title: string;
  description?: string;
  /** Present for RATE_LIMITED refusals that say how long to wait. */
  retryAfterSeconds?: number;
};

/** The whole-catalog translator (`useTranslations()` with no namespace). */
export type FailureTranslator = (key: MessageKey) => string;

const rateLimitedSchema = z.object({ retryAfterSeconds: z.int().positive() });

/** Validated before use: action-result data is never trusted blindly. */
export function readRetryAfter(error: ActionFailure): number | undefined {
  if (error.reason !== "RATE_LIMITED") return undefined;
  const parsed = rateLimitedSchema.safeParse(error.data);
  return parsed.success ? parsed.data.retryAfterSeconds : undefined;
}

export function describeFailure(t: FailureTranslator, error: ActionFailure): FailureDescription {
  switch (error.reason) {
    case "RATE_LIMITED":
      return {
        title: t("errors.describe.RATE_LIMITED.title"),
        description: error.message,
        retryAfterSeconds: readRetryAfter(error),
      };
    case "NOT_FOUND":
      return {
        title: t("errors.describe.NOT_FOUND.title"),
        description: t("errors.describe.NOT_FOUND.description"),
      };
    case "CONFLICT":
      return { title: t("errors.describe.CONFLICT.title"), description: error.message };
    case "FORBIDDEN":
    case "EMAIL_VERIFICATION_REQUIRED":
    case "TWO_FACTOR_ENROLLMENT_REQUIRED":
    case "IMPERSONATION_FORBIDDEN":
      return { title: t("errors.describe.FORBIDDEN.title"), description: error.message };
    case "UNAUTHENTICATED":
      return {
        title: t("errors.describe.UNAUTHENTICATED.title"),
        description: t("errors.describe.UNAUTHENTICATED.description"),
      };
    case "STEP_UP_LOCKED":
      return { title: t("errors.describe.STEP_UP_LOCKED.title"), description: error.message };
    case "INVALID_INPUT":
      return { title: t("errors.describe.INVALID_INPUT.title") };
    case "TWO_FACTOR_REQUIRED":
    case "STEP_UP_INVALID_CODE":
      // The runtime resolves these inside its verification flow.
      return { title: t("errors.describe.VERIFICATION_REQUIRED.title"), description: error.message };
    case "TRANSPORT":
    case "INTERNAL":
      return {
        title: t("errors.describe.UNCONFIRMED.title"),
        description: t("errors.describe.UNCONFIRMED.description"),
      };
  }
}
