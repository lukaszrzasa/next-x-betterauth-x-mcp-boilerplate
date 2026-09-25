"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { Countdown } from "@/src/components/feedback/Countdown";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { Feedback, FeedbackTone } from "@/app/(AuthModule)/admin/_/hooks/feedback";

const ICONS: Record<FeedbackTone, typeof InfoIcon> = {
  success: CheckCircle2Icon,
  info: InfoIcon,
  warning: AlertTriangleIcon,
  error: XCircleIcon,
};

const TONE_CLASSES: Record<FeedbackTone, string> = {
  success:
    "ui:border-emerald-300 ui:text-emerald-900 ui:dark:border-emerald-800 ui:dark:text-emerald-200",
  info: "",
  warning:
    "ui:border-amber-300 ui:text-amber-900 ui:dark:border-amber-800 ui:dark:text-amber-200",
  error: "ui:border-destructive/50 ui:text-destructive",
};

/**
 * The outcome of an action, in the section it belongs to. A partial outcome
 * is visually distinct from success and offers its recovery action; a rate
 * limit counts down instead of resending on its own.
 */
export function UserActionFeedback({
  feedback,
  onDismiss,
  recovery,
}: {
  feedback: Feedback | null;
  onDismiss: () => void;
  /** Rendered only when the feedback carries a recovery the caller supports. */
  recovery?: { label: string; onClick: () => void; pending: boolean };
}) {
  if (!feedback) return null;
  const Icon = ICONS[feedback.tone];
  const assertive = feedback.tone === "error" || feedback.tone === "warning";

  return (
    <Alert
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      data-tone={feedback.tone}
      className={cn("ui:pr-10", TONE_CLASSES[feedback.tone])}
    >
      <Icon aria-hidden="true" />
      <AlertTitle>{feedback.title}</AlertTitle>
      {(feedback.description || feedback.retryAfterSeconds || (recovery && feedback.recovery)) && (
        <AlertDescription className="ui:flex ui:flex-col ui:gap-2">
          {feedback.description && <p>{feedback.description}</p>}
          {feedback.retryAfterSeconds !== undefined && (
            <p>
              <Countdown
                key={`${feedback.title}:${feedback.retryAfterSeconds}`}
                seconds={feedback.retryAfterSeconds}
                render={(remaining) =>
                  remaining > 0 ? `You can send again in ${remaining}s.` : "You can send again now."
                }
              />
            </p>
          )}
          {recovery && feedback.recovery && (
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={recovery.pending}
                onClick={recovery.onClick}
              >
                {recovery.pending ? "Working…" : recovery.label}
              </Button>
            </div>
          )}
        </AlertDescription>
      )}
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
