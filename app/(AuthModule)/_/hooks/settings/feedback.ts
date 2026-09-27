import { z } from "zod";
import { describeFailure, type ActionFailure, type ActionOutcome } from "@/src/lib/actions";
import type { FeedbackTone } from "@/src/components/feedback/ActionFeedback";
import type {
  CancelOutcome,
  EmailProofOutcome,
  EmailRequestOutcome,
  SettingsEffect,
  SettingsFieldError,
  SettingsLifecycleCode,
  SyncOutcome,
} from "@/app/(AuthModule)/_/types/settings";

/**
 * How the settings pages talk about outcomes: pure helpers shared by the
 * form and action hooks, so a partial result is never dressed up as a
 * success, every closed lifecycle refusal has plain-language text, and
 * generic failures come from the shared `describeFailure`.
 */

export type { FeedbackTone };

export type RecoveryKind =
  | "retryProfileSessionRefresh"
  | "retryFactorSessionRefresh"
  | "revokeOtherSessions"
  | "revokeAllSessions";

export type Feedback = {
  tone: FeedbackTone;
  title: string;
  description?: string;
  /** A rate limit: the UI counts down and never resends by itself. */
  retryAfterSeconds?: number;
  /** A recovery action the section may offer for a partial outcome. */
  recovery?: RecoveryKind;
};

export type SyncKind =
  | "updateName"
  | "changePassword"
  | "disableAuthenticator"
  | "revokeSession"
  | "revokeOtherSessions"
  | "revokeAllSessions"
  | "retryProfileSessionRefresh"
  | "retryFactorSessionRefresh";

const fieldErrorSchema = z.object({
  field: z.enum(["currentPassword", "newPassword", "newEmail", "authenticatorCode", "code", "name"]),
  code: z.string(),
});

const lifecycleSchema = z.object({
  code: z.enum(["EXPIRED", "INACTIVE", "DESTINATION_UNAVAILABLE", "SECURITY_STATE_CHANGED", "SETUP_REPLACED"]),
});

/** Validated before use: action-result data is never trusted blindly. */
export function readFieldError(error: ActionFailure): SettingsFieldError | null {
  if (error.reason !== "CONFLICT" && error.reason !== "INVALID_INPUT") return null;
  const parsed = fieldErrorSchema.safeParse(error.data);
  return parsed.success ? parsed.data : null;
}

export function readLifecycleCode(error: ActionFailure): SettingsLifecycleCode | null {
  if (error.reason !== "CONFLICT" && error.reason !== "NOT_FOUND") return null;
  const parsed = lifecycleSchema.safeParse(error.data);
  return parsed.success ? parsed.data.code : null;
}

const LIFECYCLE_TEXT: Record<SettingsLifecycleCode, { title: string; description: string }> = {
  EXPIRED: {
    title: "This request has expired",
    description: "The 24-hour window has passed. Start again to continue.",
  },
  INACTIVE: {
    title: "This request is no longer active",
    description: "It was completed, cancelled or replaced. Refresh to see the current state.",
  },
  DESTINATION_UNAVAILABLE: {
    title: "That address cannot be used",
    description: "Another account uses it. Start again with a different address.",
  },
  SECURITY_STATE_CHANGED: {
    title: "Your security settings changed meanwhile",
    description: "Verify again and retry.",
  },
  SETUP_REPLACED: {
    title: "This authenticator setup is no longer active",
    description: "Start the setup again.",
  },
};

/** The generic description, with the closed lifecycle codes and rate limits read better for settings. */
export function describeSettingsFailure(error: ActionFailure): Feedback {
  const lifecycle = readLifecycleCode(error);
  if (lifecycle) return { tone: "warning", ...LIFECYCLE_TEXT[lifecycle] };
  const generic = describeFailure(error);
  if (error.reason === "RATE_LIMITED") {
    return { tone: "warning", title: "Please wait before trying again", description: error.message, retryAfterSeconds: generic.retryAfterSeconds };
  }
  return { tone: "error", ...generic };
}

const EFFECT_LABELS: Record<SettingsEffect, string> = {
  "session-refresh": "your other sessions could not be updated yet",
  "session-renewal": "this session could not be renewed",
  "session-revocation": "signing out could not be confirmed",
};

const COMPLETED: Record<SyncKind, string> = {
  updateName: "Name updated",
  changePassword: "Password changed",
  disableAuthenticator: "Authenticator disabled",
  revokeSession: "Session signed out",
  revokeOtherSessions: "Other devices signed out",
  revokeAllSessions: "Signed out everywhere",
  retryProfileSessionRefresh: "Sessions updated",
  retryFactorSessionRefresh: "Sessions updated",
};

const UNCHANGED: Partial<Record<SyncKind, string>> = {
  updateName: "The name is already up to date",
  disableAuthenticator: "No authenticator is enabled",
  revokeSession: "That session is already gone",
  revokeOtherSessions: "There are no other sessions",
};

const PARTIAL_TITLES: Partial<Record<SyncKind, string>> = {
  updateName: "Name updated, but",
  changePassword: "Password changed, but",
  disableAuthenticator: "Authenticator disabled, but",
  revokeSession: "Not confirmed:",
  revokeOtherSessions: "Not confirmed:",
  revokeAllSessions: "Not confirmed:",
};

const RECOVERY: Partial<Record<SyncKind, RecoveryKind>> = {
  updateName: "retryProfileSessionRefresh",
  disableAuthenticator: "retryFactorSessionRefresh",
  revokeOtherSessions: "revokeOtherSessions",
  revokeAllSessions: "revokeAllSessions",
  retryProfileSessionRefresh: "retryProfileSessionRefresh",
  retryFactorSessionRefresh: "retryFactorSessionRefresh",
};

function partialHint(renewal: boolean, committed: boolean): string {
  if (renewal) return "Your new password is saved. If this session stops working, sign in again with the new password.";
  return committed ? "The change itself is saved. Retry to finish the remaining step." : "Retry to finish signing out.";
}

function describePartial(kind: SyncKind, outcome: Extract<SyncOutcome, { status: "partial" }>): Feedback {
  const effects = outcome.failedEffects.map((effect) => EFFECT_LABELS[effect]).join(" and ");
  const renewal = outcome.failedEffects.includes("session-renewal");
  const hint = partialHint(renewal, outcome.committed);
  return {
    tone: "warning",
    title: `${PARTIAL_TITLES[kind] ?? "Not fully completed:"} ${effects}.`,
    description: hint,
    recovery: renewal ? undefined : RECOVERY[kind],
  };
}

export function describeSyncOutcome(kind: SyncKind, outcome: SyncOutcome): Feedback {
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
export function syncFeedbackFor(kind: SyncKind, result: ActionOutcome<SyncOutcome>): Feedback | null {
  if (result.status === "success") return describeSyncOutcome(kind, result.data);
  if (result.status === "error") return describeSettingsFailure(result.error);
  return null;
}

export function describeCancelOutcome(outcome: CancelOutcome, what: string): Feedback {
  return outcome.status === "completed"
    ? { tone: "success", title: `${what} cancelled` }
    : { tone: "info", title: `${what} was already closed` };
}

/** The request is recorded; the delivery is reported exactly as it went. */
export function describeEmailRequestOutcome(outcome: EmailRequestOutcome, resent = false): Feedback {
  const stage = outcome.request.state === "awaiting_current" ? "current address" : "new address";
  const verb = resent ? "resent" : "sent";
  switch (outcome.delivery) {
    case "sent":
      return { tone: "success", title: `Confirmation link ${verb} to your ${stage}`, description: "Open the link in that mailbox to continue. The request keeps its original deadline." };
    case "not-required":
      return { tone: "success", title: "Request saved" };
    case "rate-limited":
      return {
        tone: "warning",
        title: "Request saved, but the email was not sent yet",
        description: "Wait before requesting another link; the request is still active.",
        retryAfterSeconds: outcome.retryAfterSeconds,
      };
    case "failed":
      return {
        tone: "warning",
        title: "Request saved, but the email could not be sent",
        description: "The request is still active. Use Resend to try delivering the link again.",
      };
  }
}

export function describeProofOutcome(outcome: EmailProofOutcome): Feedback {
  switch (outcome.status) {
    case "current-confirmed":
      return {
        tone: "success",
        title: "Current address confirmed",
        description: "Return to your account settings, signed in as usual, to enter the new address.",
      };
    case "completed":
      return outcome.sessionRevocationPending
        ? {
            tone: "warning",
            title: "Your email was changed, but signing out existing sessions could not be confirmed.",
            description: "Sign in with your new email address. Existing sessions are signed out on their next request.",
          }
        : {
            tone: "success",
            title: "Your sign-in email has been changed",
            description: "Every existing session was signed out. Sign in with your new email address.",
          };
    case "expired":
      return { tone: "warning", title: "This link has expired", description: "Start the change again from your account settings." };
    case "destination-unavailable":
      return { tone: "warning", title: "That address cannot be used", description: "Another account uses it. Start again with a different address." };
    case "account-changed":
      return { tone: "warning", title: "This request is no longer valid", description: "Your account changed since it was started. Start again from your account settings." };
    case "inactive":
      return { tone: "warning", title: "This link is not active", description: "It was already used, replaced or cancelled." };
  }
}
