"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { secondsUntil, useNowSeconds } from "@/src/lib/hooks/useNow";
import { formatTimeLeft } from "@/src/lib/date/duration";
import { toIsoInstant } from "@/src/lib/date/format";
import type { PendingEmailRequest } from "@/app/(AuthModule)/_/types/settings";

type Pending = Exclude<PendingEmailRequest, { state: "none" }>;
/** The stages that are waiting for a mailbox, so their link can be sent again. */
type AwaitingMail = Extract<Pending, { resendAfter: string | null }>;

const isAwaitingMail = (request: Pending): request is AwaitingMail => "resendAfter" in request;

/** Seconds until another link may be sent; zero when it may be sent now. */
function resendCooldown(request: AwaitingMail, now: number | null): number {
  if (!request.resendAfter) return 0;
  return secondsUntil(request.resendAfter, now) ?? 0;
}

/**
 * The owner's view of a pending request: stage, full addresses, the fixed
 * UTC deadline with the time left, and exactly the next action, with the
 * resend/cancel controls for the stage that has them.
 */
export function EmailRequestStatus({
  request,
  pending,
  onResend,
  onCancel,
  onEnterNewAddress,
}: {
  request: Pending;
  pending: boolean;
  onResend: () => void;
  onCancel: () => void;
  /** The `awaiting_new_address` stage's next step: opens the new-address form. */
  onEnterNewAddress?: () => void;
}) {
  const t = useTranslations("auth.settings.email.status");
  const tTimeLeft = useTranslations("common.timeLeft");
  const format = useFormatter();
  const now = useNowSeconds();
  const remaining = secondsUntil(request.expiresAt, now);
  const cooldown = isAwaitingMail(request) ? resendCooldown(request, now) : 0;

  return (
    <div className="ui:flex ui:flex-col ui:gap-3 ui:rounded-lg ui:border ui:bg-muted/40 ui:p-4">
      <div>
        <p className="ui:text-sm ui:font-medium">{t(`${request.state}.title`)}</p>
        <p className="ui:mt-1 ui:text-sm ui:text-muted-foreground">{t(`${request.state}.next`)}</p>
      </div>
      <dl className="ui:grid ui:grid-cols-1 ui:gap-x-6 ui:gap-y-2 ui:text-sm ui:sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="ui:text-muted-foreground">{t("currentAddress")}</dt>
        <dd className="ui:break-all">{request.originalEmail}</dd>
        {request.state === "awaiting_new" && (
          <>
            <dt className="ui:text-muted-foreground">{t("newAddress")}</dt>
            <dd className="ui:break-all">{request.newEmail}</dd>
          </>
        )}
        <dt className="ui:text-muted-foreground">{t("expires")}</dt>
        <dd>
          <time dateTime={toIsoInstant(request.expiresAt)}>
            {format.dateTime(new Date(request.expiresAt), "dateTime")}
          </time>
          {remaining !== null && <span aria-live="off"> ({formatTimeLeft(remaining, tTimeLeft)})</span>}
        </dd>
      </dl>
      <div className="ui:flex ui:flex-wrap ui:gap-2">
        {onEnterNewAddress && (
          <Button type="button" size="sm" disabled={pending} onClick={onEnterNewAddress}>
            {t("enterNewAddress")}
          </Button>
        )}
        {isAwaitingMail(request) && (
          <Button type="button" size="sm" variant="outline" disabled={pending || cooldown > 0} onClick={onResend}>
            {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          {t("cancelRequest")}
        </Button>
      </div>
    </div>
  );
}
