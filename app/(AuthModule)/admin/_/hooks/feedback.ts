import { z } from "zod";
import { describeFailure, type ActionFailure, type ActionOutcome } from "@/src/lib/actions";
import type { FeedbackTone } from "@/src/components/feedback/ActionFeedback";
import type {
  FailedEffect,
  UserFieldError,
  UserMutationOutcome,
} from "@/app/(AuthModule)/admin/_/types";

/**
 * How the detail page talks about outcomes: pure helpers shared by the form
 * and action hooks, so a partial result is never dressed up as a success and
 * every refusal has plain-language text (generic failures come from
 * `describeFailure`; this file adds what is specific to user accounts).
 */

export type { FeedbackTone };

export type Feedback = {
  tone: FeedbackTone;
  title: string;
  description?: string;
  /** A rate limit: the UI counts down and does not resend by itself. */
  retryAfterSeconds?: number;
  /** A recovery action the UI may offer for a partial outcome. */
  recovery?: RecoveryKind;
};

export type RecoveryKind =
  | "retryNameSessionRefresh"
  | "retryEmailChangeEffects"
  | "retryBanSessions"
  | "retryUnbanSessionRefresh"
  | "revokeSessions";

export type MutationKind =
  | "updateName"
  | "updateEmail"
  | "sendVerification"
  | "sendPasswordReset"
  | "revokeSessions"
  | "ban"
  | "unban"
  | RecoveryKind;

const fieldErrorSchema = z.object({
  field: z.enum(["email", "name", "reason", "duration"]),
  code: z.string(),
});

/** Validated before use: action-result data is never trusted blindly. */
export function readFieldError(error: ActionFailure): UserFieldError | null {
  if (error.reason !== "CONFLICT" && error.reason !== "INVALID_INPUT") return null;
  const parsed = fieldErrorSchema.safeParse(error.data);
  return parsed.success ? parsed.data : null;
}

const FAILURE_TITLES: Partial<Record<ActionFailure["reason"], string>> = {
  RATE_LIMITED: "Please wait before sending another email",
  NOT_FOUND: "This user no longer exists",
};

/** The generic description, with the titles that read better for a user account. */
export function describeUserFailure(error: ActionFailure): Feedback {
  const generic = describeFailure(error);
  const tone: FeedbackTone = error.reason === "RATE_LIMITED" ? "warning" : "error";
  return { tone, ...generic, title: FAILURE_TITLES[error.reason] ?? generic.title };
}

const EFFECT_LABELS: Record<FailedEffect["effect"], string> = {
  "session-refresh": "the user's active sessions could not be updated",
  "session-revocation": "sessions could not be fully revoked",
  "verification-email": "the verification email could not be sent",
};

function describeEffect(effect: FailedEffect): string {
  const label = EFFECT_LABELS[effect.effect];
  if (effect.code === "RATE_LIMITED" && effect.retryAfterSeconds) {
    return `${label} (wait ${effect.retryAfterSeconds} seconds and resend)`;
  }
  return label;
}

const COMPLETED: Record<MutationKind, string> = {
  updateName: "Name updated",
  updateEmail: "Email updated. The new address must be verified; the user has been signed out.",
  sendVerification: "Verification email requested",
  sendPasswordReset: "Password-reset email requested",
  revokeSessions: "Signed out of all devices",
  ban: "Ban saved. The user has been signed out.",
  unban: "Ban removed",
  retryNameSessionRefresh: "Active sessions updated",
  retryEmailChangeEffects: "Sessions revoked and verification requested",
  retryBanSessions: "The user has been signed out",
  retryUnbanSessionRefresh: "Active sessions updated",
};

const UNCHANGED: Partial<Record<MutationKind, string>> = {
  updateName: "The name is already up to date",
  updateEmail: "The email address is already up to date",
  sendVerification: "This email address is already verified",
  unban: "This user is not banned",
};

const PARTIAL_TITLES: Partial<Record<MutationKind, string>> = {
  updateName: "Name updated, but",
  updateEmail: "Email updated, but",
  ban: "Ban saved, but",
  unban: "Ban removed, but",
  revokeSessions: "Sign-out not confirmed:",
};

/** Which recovery finishes a partial outcome of each kind; retries recover themselves. */
const RECOVERY: Partial<Record<MutationKind, RecoveryKind>> = {
  updateName: "retryNameSessionRefresh",
  updateEmail: "retryEmailChangeEffects",
  ban: "retryBanSessions",
  unban: "retryUnbanSessionRefresh",
  revokeSessions: "revokeSessions",
  retryNameSessionRefresh: "retryNameSessionRefresh",
  retryEmailChangeEffects: "retryEmailChangeEffects",
  retryBanSessions: "retryBanSessions",
  retryUnbanSessionRefresh: "retryUnbanSessionRefresh",
};

const SIGN_OUT_KINDS: readonly MutationKind[] = ["revokeSessions", "ban", "retryBanSessions"];

function describePartial(
  kind: MutationKind,
  outcome: Extract<UserMutationOutcome, { status: "partial" }>,
): Feedback {
  const rateLimited = outcome.failedEffects.find((effect) => effect.code === "RATE_LIMITED");
  const effects = outcome.failedEffects.map(describeEffect).join(" and ");
  const hint = SIGN_OUT_KINDS.includes(kind)
    ? "Retry to finish signing the user out."
    : "The change itself is saved. Retry to finish the remaining steps.";
  return {
    tone: "warning",
    title: `${PARTIAL_TITLES[kind] ?? "Not fully completed:"} ${effects}.`,
    description: hint,
    recovery: RECOVERY[kind],
    retryAfterSeconds: rateLimited?.retryAfterSeconds,
  };
}

/** The feedback for a successful action call, by the payload's status. */
export function describeOutcome(kind: MutationKind, outcome: UserMutationOutcome): Feedback {
  switch (outcome.status) {
    case "unchanged":
      return { tone: "info", title: UNCHANGED[kind] ?? "No change" };
    case "completed":
      return { tone: "success", title: COMPLETED[kind] };
    case "partial":
      return describePartial(kind, outcome);
  }
}

/** One place that turns an `execute` outcome into feedback, or nothing for busy/cancelled. */
export function feedbackFor(
  kind: MutationKind,
  result: ActionOutcome<UserMutationOutcome>,
): Feedback | null {
  if (result.status === "success") return describeOutcome(kind, result.data);
  if (result.status === "error") return describeUserFailure(result.error);
  return null;
}
