import { z } from "zod";
import type { ActionFailure } from "./types";

/**
 * Plain-language text for every way an action can refuse or fail, keyed by
 * the shared `ActionError` reasons (not by any provider's errors). Opaque
 * failures say what to do next rather than what went wrong. Feature code
 * layers its own field-level handling on top; this is the fallback.
 */

export type FailureDescription = {
  title: string;
  description?: string;
  /** Present for RATE_LIMITED refusals that say how long to wait. */
  retryAfterSeconds?: number;
};

const rateLimitedSchema = z.object({ retryAfterSeconds: z.int().positive() });

/** Validated before use: action-result data is never trusted blindly. */
export function readRetryAfter(error: ActionFailure): number | undefined {
  if (error.reason !== "RATE_LIMITED") return undefined;
  const parsed = rateLimitedSchema.safeParse(error.data);
  return parsed.success ? parsed.data.retryAfterSeconds : undefined;
}

export function describeFailure(error: ActionFailure): FailureDescription {
  switch (error.reason) {
    case "RATE_LIMITED":
      return {
        title: "Please wait before trying again",
        description: error.message,
        retryAfterSeconds: readRetryAfter(error),
      };
    case "NOT_FOUND":
      return {
        title: "This no longer exists",
        description: "Refresh the page to see the current state.",
      };
    case "CONFLICT":
      return { title: "That change is not possible right now", description: error.message };
    case "FORBIDDEN":
    case "EMAIL_VERIFICATION_REQUIRED":
    case "TWO_FACTOR_ENROLLMENT_REQUIRED":
    case "IMPERSONATION_FORBIDDEN":
      return { title: "Not allowed", description: error.message };
    case "UNAUTHENTICATED":
      return { title: "Your session has ended", description: "Sign in again to continue." };
    case "STEP_UP_LOCKED":
      return { title: "Verification is locked", description: error.message };
    case "INVALID_INPUT":
      return { title: "Check the values you entered" };
    case "TWO_FACTOR_REQUIRED":
    case "STEP_UP_INVALID_CODE":
      // The runtime resolves these inside its verification flow.
      return { title: "Verification is required", description: error.message };
    case "TRANSPORT":
    case "INTERNAL":
      return {
        title: "The action could not be confirmed",
        description:
          "It may or may not have applied. Refresh the page to see the current state before trying again.",
      };
  }
}
