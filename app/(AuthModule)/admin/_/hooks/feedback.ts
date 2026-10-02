import { z } from "zod";
import { describeFailure, type ActionFailure, type ActionOutcome } from "@/src/lib/actions";
import type { FeedbackTone } from "@/src/components/feedback/ActionFeedback";
import type {
  FailedEffect,
  UserFieldError,
  UserMutationOutcome,
} from "@/app/(AuthModule)/admin/_/types";
import type { MessageKey } from "@/src/lib/i18n";
import type { CatalogTranslator } from "@/src/lib/i18n/useCatalog";

/**
 * How the detail page talks about outcomes: pure helpers shared by the form
 * and action hooks, so a partial result is never dressed up as a success and
 * every refusal has plain-language text (generic failures come from
 * `describeFailure`; this file adds what is specific to user accounts). Every
 * sentence comes from the `authAdmin.feedback` catalog through the `t` the
 * caller holds, so the helpers stay pure and the language stays the viewer's.
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

/** Keys are spelled out rather than computed so the catalog type checks every one. */
const FAILURE_TITLE_KEYS: Partial<Record<ActionFailure["reason"], MessageKey>> = {
  RATE_LIMITED: "authAdmin.feedback.failureTitle.RATE_LIMITED",
  NOT_FOUND: "authAdmin.feedback.failureTitle.NOT_FOUND",
};

/** The generic description, with the titles that read better for a user account. */
export function describeUserFailure(t: CatalogTranslator, error: ActionFailure): Feedback {
  const generic = describeFailure(t, error);
  const tone: FeedbackTone = error.reason === "RATE_LIMITED" ? "warning" : "error";
  const titleKey = FAILURE_TITLE_KEYS[error.reason];
  return { tone, ...generic, title: titleKey ? t(titleKey) : generic.title };
}

const EFFECT_KEYS: Record<FailedEffect["effect"], MessageKey> = {
  "session-refresh": "authAdmin.feedback.effect.sessionRefresh",
  "session-revocation": "authAdmin.feedback.effect.sessionRevocation",
  "verification-email": "authAdmin.feedback.effect.verificationEmail",
};

function describeEffect(t: CatalogTranslator, effect: FailedEffect): string {
  const label = t(EFFECT_KEYS[effect.effect]);
  if (effect.code === "RATE_LIMITED" && effect.retryAfterSeconds) {
    return t("authAdmin.feedback.effectRateLimited", { label, seconds: effect.retryAfterSeconds });
  }
  return label;
}

const COMPLETED_KEYS: Record<MutationKind, MessageKey> = {
  updateName: "authAdmin.feedback.completed.updateName",
  updateEmail: "authAdmin.feedback.completed.updateEmail",
  sendVerification: "authAdmin.feedback.completed.sendVerification",
  sendPasswordReset: "authAdmin.feedback.completed.sendPasswordReset",
  revokeSessions: "authAdmin.feedback.completed.revokeSessions",
  ban: "authAdmin.feedback.completed.ban",
  unban: "authAdmin.feedback.completed.unban",
  retryNameSessionRefresh: "authAdmin.feedback.completed.retryNameSessionRefresh",
  retryEmailChangeEffects: "authAdmin.feedback.completed.retryEmailChangeEffects",
  retryBanSessions: "authAdmin.feedback.completed.retryBanSessions",
  retryUnbanSessionRefresh: "authAdmin.feedback.completed.retryUnbanSessionRefresh",
};

const UNCHANGED_KEYS: Partial<Record<MutationKind, MessageKey>> = {
  updateName: "authAdmin.feedback.unchanged.updateName",
  updateEmail: "authAdmin.feedback.unchanged.updateEmail",
  sendVerification: "authAdmin.feedback.unchanged.sendVerification",
  unban: "authAdmin.feedback.unchanged.unban",
};

const PARTIAL_TITLE_KEYS: Partial<Record<MutationKind, MessageKey>> = {
  updateName: "authAdmin.feedback.partialTitle.updateName",
  updateEmail: "authAdmin.feedback.partialTitle.updateEmail",
  ban: "authAdmin.feedback.partialTitle.ban",
  unban: "authAdmin.feedback.partialTitle.unban",
  revokeSessions: "authAdmin.feedback.partialTitle.revokeSessions",
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
  t: CatalogTranslator,
  kind: MutationKind,
  outcome: Extract<UserMutationOutcome, { status: "partial" }>,
): Feedback {
  const rateLimited = outcome.failedEffects.find((effect) => effect.code === "RATE_LIMITED");
  const effects = outcome.failedEffects
    .map((effect) => describeEffect(t, effect))
    .join(t("authAdmin.feedback.effectJoiner"));
  const prefix = t(PARTIAL_TITLE_KEYS[kind] ?? "authAdmin.feedback.partialTitle.default");
  const hint = SIGN_OUT_KINDS.includes(kind)
    ? t("authAdmin.feedback.hintSignOut")
    : t("authAdmin.feedback.hintRemaining");
  return {
    tone: "warning",
    title: t("authAdmin.feedback.partial", { prefix, effects }),
    description: hint,
    recovery: RECOVERY[kind],
    retryAfterSeconds: rateLimited?.retryAfterSeconds,
  };
}

/** The action happened; only its staff log entry is missing, and the staff member must know. */
function withUnrecorded(t: CatalogTranslator, feedback: Feedback, outcome: UserMutationOutcome): Feedback {
  if (outcome.status === "unchanged" || !outcome.unrecorded) return feedback;
  const unrecorded = t("authAdmin.feedback.unrecorded");
  return {
    ...feedback,
    tone: "warning",
    description: feedback.description ? `${feedback.description} ${unrecorded}` : unrecorded,
  };
}

/** The feedback for a successful action call, by the payload's status. */
export function describeOutcome(t: CatalogTranslator, kind: MutationKind, outcome: UserMutationOutcome): Feedback {
  switch (outcome.status) {
    case "unchanged":
      return {
        tone: "info",
        title: t(UNCHANGED_KEYS[kind] ?? "authAdmin.feedback.unchanged.default"),
      };
    case "completed":
      return withUnrecorded(t, { tone: "success", title: t(COMPLETED_KEYS[kind]) }, outcome);
    case "partial":
      return withUnrecorded(t, describePartial(t, kind, outcome), outcome);
  }
}

/** One place that turns an `execute` outcome into feedback, or nothing for busy/cancelled. */
export function feedbackFor(
  t: CatalogTranslator,
  kind: MutationKind,
  result: ActionOutcome<UserMutationOutcome>,
): Feedback | null {
  if (result.status === "success") return describeOutcome(t, kind, result.data);
  if (result.status === "error") return describeUserFailure(t, result.error);
  return null;
}
