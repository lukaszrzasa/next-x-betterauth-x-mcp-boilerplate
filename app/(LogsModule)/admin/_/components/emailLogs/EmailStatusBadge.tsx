import type { ComponentProps } from "react";
import { CheckCircle2Icon, CircleHelpIcon, ClockIcon, XCircleIcon, type LucideIcon } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import type { EmailLogStatus } from "@/app/(LogsModule)/_/types";

type Presentation = { label: string; icon: LucideIcon; variant: ComponentProps<typeof Badge>["variant"]; title: string };

/** Text and an icon, never colour alone. `accepted` is the provider's acceptance, not delivery. */
export const EMAIL_STATUS_PRESENTATION: Record<EmailLogStatus, Presentation> = {
  sending: { label: "Sending", icon: ClockIcon, variant: "outline", title: "No completion recorded yet" },
  accepted: {
    label: "Accepted",
    icon: CheckCircle2Icon,
    variant: "secondary",
    title: "The provider accepted the message; delivery to the inbox is not tracked",
  },
  failed: { label: "Failed", icon: XCircleIcon, variant: "destructive", title: "The attempt failed" },
  unknown: {
    label: "Unknown",
    icon: CircleHelpIcon,
    variant: "outline",
    title: "The outcome could not be determined",
  },
};

export const EMAIL_STATUS_LABELS: Record<EmailLogStatus, string> = {
  sending: EMAIL_STATUS_PRESENTATION.sending.label,
  accepted: EMAIL_STATUS_PRESENTATION.accepted.label,
  failed: EMAIL_STATUS_PRESENTATION.failed.label,
  unknown: EMAIL_STATUS_PRESENTATION.unknown.label,
};

export function EmailStatusBadge({ status }: { status: string }) {
  const presentation = (EMAIL_STATUS_PRESENTATION as Record<string, Presentation | undefined>)[status];
  if (!presentation) return <Badge variant="outline">{status}</Badge>;
  const Icon = presentation.icon;
  return (
    <Badge variant={presentation.variant} title={presentation.title}>
      <Icon aria-hidden="true" />
      {presentation.label}
    </Badge>
  );
}
