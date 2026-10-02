"use client";

import type { ComponentProps } from "react";
import { CheckCircle2Icon, CircleHelpIcon, ClockIcon, XCircleIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/src/components/ui/badge";
import { EMAIL_LOG_STATUSES, type EmailLogStatus } from "@/app/(LogsModule)/_/types";

type Presentation = { icon: LucideIcon; variant: ComponentProps<typeof Badge>["variant"] };

/** An icon beside the text, never colour alone. `accepted` is the provider's acceptance, not delivery. */
const EMAIL_STATUS_PRESENTATION: Record<EmailLogStatus, Presentation> = {
  sending: { icon: ClockIcon, variant: "outline" },
  accepted: { icon: CheckCircle2Icon, variant: "secondary" },
  failed: { icon: XCircleIcon, variant: "destructive" },
  unknown: { icon: CircleHelpIcon, variant: "outline" },
};

function isKnownStatus(status: string): status is EmailLogStatus {
  return (EMAIL_LOG_STATUSES as readonly string[]).includes(status);
}

export function EmailStatusBadge({ status }: { status: string }) {
  const t = useTranslations("logsAdmin.emailLogs.status");
  if (!isKnownStatus(status)) return <Badge variant="outline">{status}</Badge>;
  const { icon: Icon, variant } = EMAIL_STATUS_PRESENTATION[status];
  return (
    <Badge variant={variant} title={t(`${status}.title`)}>
      <Icon aria-hidden="true" />
      {t(`${status}.label`)}
    </Badge>
  );
}
