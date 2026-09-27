"use client";

import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, XCircleIcon, XIcon, type LucideIcon } from "lucide-react";
import { Countdown } from "@/src/components/feedback/Countdown";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

export type FeedbackTone = "success" | "info" | "warning" | "error";

/** What a feature's feedback must carry; its own `recovery` union stays feature-typed. */
export type ActionFeedbackMessage = {
  tone: FeedbackTone;
  title: string;
  description?: string;
  /** A rate limit: the UI counts down and never retries by itself. */
  retryAfterSeconds?: number;
  /** The recovery the outcome allows; offered only when the caller supplies a handler. */
  recovery?: string;
};

export type FeedbackRecovery = { label: string; onClick: () => void; pending: boolean };

/** Errors and warnings interrupt a screen reader; the rest wait their turn. */
const TONES: Record<FeedbackTone, { icon: LucideIcon; className: string; role: "alert" | "status"; live: "assertive" | "polite" }> = {
  success: {
    icon: CheckCircle2Icon,
    className: "ui:border-emerald-300 ui:text-emerald-900 ui:dark:border-emerald-800 ui:dark:text-emerald-200",
    role: "status",
    live: "polite",
  },
  info: { icon: InfoIcon, className: "", role: "status", live: "polite" },
  warning: {
    icon: AlertTriangleIcon,
    className: "ui:border-amber-300 ui:text-amber-900 ui:dark:border-amber-800 ui:dark:text-amber-200",
    role: "alert",
    live: "assertive",
  },
  error: { icon: XCircleIcon, className: "ui:border-destructive/50 ui:text-destructive", role: "alert", live: "assertive" },
};

function FeedbackDetails({
  feedback,
  recovery,
  retryVerb,
}: {
  feedback: ActionFeedbackMessage;
  recovery: FeedbackRecovery | undefined;
  retryVerb: string;
}) {
  const { description, retryAfterSeconds } = feedback;
  if (description === undefined && retryAfterSeconds === undefined && recovery === undefined) return null;

  return (
    <AlertDescription className="ui:flex ui:flex-col ui:gap-2">
      {description && <p>{description}</p>}
      {retryAfterSeconds !== undefined && (
        <p>
          <Countdown
            key={`${feedback.title}:${retryAfterSeconds}`}
            seconds={retryAfterSeconds}
            render={(remaining) => (remaining > 0 ? `You can ${retryVerb} in ${remaining}s.` : `You can ${retryVerb} now.`)}
          />
        </p>
      )}
      {recovery && (
        <div>
          <Button type="button" size="sm" variant="outline" disabled={recovery.pending} onClick={recovery.onClick}>
            {recovery.pending ? "Working…" : recovery.label}
          </Button>
        </div>
      )}
    </AlertDescription>
  );
}

/**
 * The outcome of an action, in the section it belongs to. A partial outcome
 * is visually distinct from success and offers its recovery action; a rate
 * limit counts down instead of retrying on its own.
 */
export function ActionFeedback({
  feedback,
  onDismiss,
  recovery,
  retryVerb = "try again",
}: {
  feedback: ActionFeedbackMessage | null;
  onDismiss: () => void;
  /** The handler for the feedback's recovery, when the section supports it. */
  recovery?: FeedbackRecovery;
  /** Completes "You can … in 42s." for a rate limit. */
  retryVerb?: string;
}) {
  if (!feedback) return null;
  const tone = TONES[feedback.tone];
  const Icon = tone.icon;

  return (
    <Alert
      role={tone.role}
      aria-live={tone.live}
      data-tone={feedback.tone}
      className={cn("ui:pr-10", tone.className)}
    >
      <Icon aria-hidden="true" />
      <AlertTitle className="ui:whitespace-normal">{feedback.title}</AlertTitle>
      <FeedbackDetails
        feedback={feedback}
        recovery={feedback.recovery ? recovery : undefined}
        retryVerb={retryVerb}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss"
        className="ui:absolute ui:top-2 ui:right-2 ui:text-current"
        onClick={onDismiss}
      >
        <XIcon />
      </Button>
    </Alert>
  );
}
