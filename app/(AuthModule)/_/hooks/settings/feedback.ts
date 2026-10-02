import { z } from "zod";
import { describeFailure, type ActionFailure, type ActionOutcome } from "@/src/lib/actions";
import type { MessageKey } from "@/src/lib/i18n";
import type { CatalogTranslator } from "@/src/lib/i18n/useCatalog";
import type { FeedbackTone } from "@/src/components/feedback/ActionFeedback";
import type {
  CancelOutcome,
  EmailProofOutcome,
  EmailRequestOutcome,
  SettingsFieldError,
  SettingsLifecycleCode,
  SyncOutcome,
} from "@/app/(AuthModule)/_/types/settings";

/**
 * How the settings pages talk about outcomes: pure helpers shared by the
 * form and action hooks, so a partial result is never dressed up as a
 * success, every closed lifecycle refusal has plain-language text, and
 * generic failures come from the shared `describeFailure`. Every helper
 * takes the whole-catalog translator (`useTranslations()`): the text is the
 * viewer's language, the helpers stay pure and testable.
 */

export type { FeedbackTone };

/** The whole-catalog translator, from `useCatalog()`. */
export type Translator = CatalogTranslator;

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

/** The generic description, with the closed lifecycle codes and rate limits read better for settings. */
export function describeSettingsFailure(t: Translator, error: ActionFailure): Feedback {
  const lifecycle = readLifecycleCode(error);
  if (lifecycle) {
    return {
      tone: "warning",
      title: t(`auth.settings.feedback.lifecycle.${lifecycle}.title`),
      description: t(`auth.settings.feedback.lifecycle.${lifecycle}.description`),
    };
  }
  const generic = describeFailure((key) => t(key as MessageKey), error);
  if (error.reason === "RATE_LIMITED") {
    return {
      tone: "warning",
      title: t("auth.settings.feedback.rateLimited"),
      description: error.message,
      retryAfterSeconds: generic.retryAfterSeconds,
    };
  }
  return { tone: "error", ...generic };
}

const UNCHANGED_KINDS = ["updateName", "disableAuthenticator", "revokeSession", "revokeOtherSessions"] as const;
const PARTIAL_TITLE_KINDS = [
  "updateName",
  "changePassword",
  "disableAuthenticator",
  "revokeSession",
  "revokeOtherSessions",
  "revokeAllSessions",
] as const;

const isOneOf = <T extends SyncKind>(kinds: readonly T[], kind: SyncKind): kind is T =>
  (kinds as readonly SyncKind[]).includes(kind);

const RECOVERY: Partial<Record<SyncKind, RecoveryKind>> = {
  updateName: "retryProfileSessionRefresh",
  disableAuthenticator: "retryFactorSessionRefresh",
  revokeOtherSessions: "revokeOtherSessions",
  revokeAllSessions: "revokeAllSessions",
  retryProfileSessionRefresh: "retryProfileSessionRefresh",
  retryFactorSessionRefresh: "retryFactorSessionRefresh",
};

function partialHint(t: Translator, renewal: boolean, committed: boolean): string {
  if (renewal) return t("auth.settings.feedback.hints.renewal");
  return committed ? t("auth.settings.feedback.hints.committed") : t("auth.settings.feedback.hints.signOut");
}

function describePartial(t: Translator, kind: SyncKind, outcome: Extract<SyncOutcome, { status: "partial" }>): Feedback {
  const effects = outcome.failedEffects
    .map((effect) => t(`auth.settings.feedback.effects.${effect}`))
    .join(t("auth.settings.feedback.effectsJoin"));
  const renewal = outcome.failedEffects.includes("session-renewal");
  const title = isOneOf(PARTIAL_TITLE_KINDS, kind)
    ? t(`auth.settings.feedback.partialTitles.${kind}`)
    : t("auth.settings.feedback.partialTitles.default");
  return {
    tone: "warning",
    title: t("auth.settings.feedback.partialTitle", { title, effects }),
    description: partialHint(t, renewal, outcome.committed),
    recovery: renewal ? undefined : RECOVERY[kind],
  };
}

export function describeSyncOutcome(t: Translator, kind: SyncKind, outcome: SyncOutcome): Feedback {
  switch (outcome.status) {
    case "unchanged":
      return {
        tone: "info",
        title: isOneOf(UNCHANGED_KINDS, kind)
          ? t(`auth.settings.feedback.unchanged.${kind}`)
          : t("auth.settings.feedback.unchanged.default"),
      };
    case "completed":
      return { tone: "success", title: t(`auth.settings.feedback.completed.${kind}`) };
    case "partial":
      return describePartial(t, kind, outcome);
  }
}

/** One place that turns an `execute` outcome into feedback, or nothing for busy/cancelled. */
export function syncFeedbackFor(t: Translator, kind: SyncKind, result: ActionOutcome<SyncOutcome>): Feedback | null {
  if (result.status === "success") return describeSyncOutcome(t, kind, result.data);
  if (result.status === "error") return describeSettingsFailure(t, result.error);
  return null;
}

export function describeCancelOutcome(t: Translator, outcome: CancelOutcome, what: string): Feedback {
  return outcome.status === "completed"
    ? { tone: "success", title: t("auth.settings.feedback.cancelled", { what }) }
    : { tone: "info", title: t("auth.settings.feedback.alreadyClosed", { what }) };
}

/** The request is recorded; the delivery is reported exactly as it went. */
export function describeEmailRequestOutcome(t: Translator, outcome: EmailRequestOutcome, resent = false): Feedback {
  const stage = outcome.request.state === "awaiting_current" ? "current" : "new";
  const verb = resent ? "resent" : "sent";
  switch (outcome.delivery) {
    case "sent":
      return {
        tone: "success",
        title: t("auth.settings.feedback.emailRequest.sent", { verb, stage }),
        description: t("auth.settings.feedback.emailRequest.sentDescription"),
      };
    case "not-required":
      return { tone: "success", title: t("auth.settings.feedback.emailRequest.saved") };
    case "rate-limited":
      return {
        tone: "warning",
        title: t("auth.settings.feedback.emailRequest.rateLimitedTitle"),
        description: t("auth.settings.feedback.emailRequest.rateLimitedDescription"),
        retryAfterSeconds: outcome.retryAfterSeconds,
      };
    case "failed":
      return {
        tone: "warning",
        title: t("auth.settings.feedback.emailRequest.failedTitle"),
        description: t("auth.settings.feedback.emailRequest.failedDescription"),
      };
  }
}

const PROOF_KEYS = {
  "current-confirmed": "currentConfirmed",
  expired: "expired",
  "destination-unavailable": "destinationUnavailable",
  "account-changed": "accountChanged",
  inactive: "inactive",
} as const;

export function describeProofOutcome(t: Translator, outcome: EmailProofOutcome): Feedback {
  if (outcome.status === "completed") {
    const key = outcome.sessionRevocationPending ? "completedPending" : "completed";
    return {
      tone: outcome.sessionRevocationPending ? "warning" : "success",
      title: t(`auth.settings.feedback.proof.${key}.title`),
      description: t(`auth.settings.feedback.proof.${key}.description`),
    };
  }
  const key = PROOF_KEYS[outcome.status];
  return {
    tone: outcome.status === "current-confirmed" ? "success" : "warning",
    title: t(`auth.settings.feedback.proof.${key}.title`),
    description: t(`auth.settings.feedback.proof.${key}.description`),
  };
}
