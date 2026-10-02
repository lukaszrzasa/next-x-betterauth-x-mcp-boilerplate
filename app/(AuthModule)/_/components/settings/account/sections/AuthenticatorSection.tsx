"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCwIcon, ShieldCheckIcon, ShieldOffIcon, ShieldPlusIcon } from "lucide-react";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { FormDialog } from "@/src/components/feedback/FormDialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/src/components/ui/tooltip";
import { ActionFeedback } from "@/src/components/feedback/ActionFeedback";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import { useRetryFactorSessionRefresh } from "@/app/(AuthModule)/_/hooks/settings/actions/useRetryFactorSessionRefresh";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { AccountSettings } from "@/app/(AuthModule)/_/types/settings";
import {
  AuthenticatorSetupFlow,
  setupStepTitleKey,
  type SetupKind,
  type SetupStepName,
} from "@/app/(AuthModule)/_/components/settings/account/AuthenticatorSetupFlow";
import { DisableAuthenticatorForm } from "@/app/(AuthModule)/_/components/settings/account/forms/DisableAuthenticatorForm";

type Flow = { kind: SetupKind; key: number; step: SetupStepName };

/** Marks a factor the account cannot turn off; the reason is in a tooltip, not a native title. */
function RequiredBadge() {
  const t = useTranslations("auth.settings.authenticator");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0} className="ui:cursor-default">
          {t("requiredBadge")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t("requiredTooltip")}</TooltipContent>
    </Tooltip>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  const t = useTranslations("auth.settings.authenticator");
  if (enabled) return <Badge variant="secondary">{t("enabled")}</Badge>;
  return (
    <Badge variant="outline" className="ui:text-muted-foreground">
      {t("notSetUp")}
    </Badge>
  );
}

/** What the account may do with its factor: set one up, or replace it and (when optional) disable it. */
function AuthenticatorControls({
  account,
  onStart,
  onDisable,
}: {
  account: AccountSettings;
  onStart: (kind: SetupKind) => void;
  onDisable: () => void;
}) {
  const t = useTranslations("auth.settings.authenticator");
  if (!account.twoFactorEnabled) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => onStart("enroll")}>
        <ShieldPlusIcon aria-hidden="true" />
        {t("setUp")}
      </Button>
    );
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => onStart("replace")}>
        <RefreshCwIcon aria-hidden="true" />
        {t("replace")}
      </Button>
      {!account.twoFactorRequired && (
        <Button type="button" variant="outline" size="sm" onClick={onDisable}>
          <ShieldOffIcon aria-hidden="true" />
          {t("disable")}
        </Button>
      )}
    </>
  );
}

/**
 * Authenticator state and the permitted action: set up, replace, or
 * disable when neither the staff role nor the stored policy requires it.
 * A required factor is marked beside the heading, with the explanation in
 * a tooltip.
 */
export function AuthenticatorSection({ account }: { account: AccountSettings }) {
  const t = useTranslations("auth.settings.authenticator");
  const tAll = useTranslations();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [disabling, setDisabling] = useState(false);
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();
  const retry = useRetryFactorSessionRefresh({ onSettled: setFeedback });

  const start = (kind: SetupKind) => {
    dismiss();
    setFlow({ kind, key: Date.now(), step: "password" });
  };
  const disable = () => {
    dismiss();
    setDisabling(true);
  };
  const recovery =
    feedback?.recovery === "retryFactorSessionRefresh"
      ? { label: tAll("auth.settings.common.retry"), pending: retry.pending, onClick: () => void retry.run() }
      : undefined;

  return (
    <DetailSection
      title={t("title")}
      titleAddon={account.twoFactorRequired ? <RequiredBadge /> : undefined}
      description={t("description")}
      icon={ShieldCheckIcon}
    >
      <ActionFeedback feedback={feedback} onDismiss={dismiss} recovery={recovery} />
      <div>
        <DetailRow
          label={t("status")}
          control={
            account.emailVerified ? (
              <AuthenticatorControls account={account} onStart={start} onDisable={disable} />
            ) : undefined
          }
        >
          <StatusBadge enabled={account.twoFactorEnabled} />
          {!account.emailVerified && (
            <p className="ui:mt-1 ui:text-xs ui:text-muted-foreground">
              {t("unverifiedHint")}
            </p>
          )}
        </DetailRow>
      </div>

      {flow && (
        <FormDialog
          open
          onOpenChange={(next) => !next && setFlow(null)}
          title={tAll(setupStepTitleKey(flow.kind, flow.step))}
          className={flow.step === "codes" ? "ui:sm:max-w-xl" : undefined}
        >
          <AuthenticatorSetupFlow
            key={flow.key}
            kind={flow.kind}
            onSettled={setFeedback}
            onClose={() => setFlow(null)}
            onStep={(step) => setFlow((current) => (current ? { ...current, step } : current))}
          />
        </FormDialog>
      )}
      <FormDialog open={disabling} onOpenChange={setDisabling} title={t("disableDialogTitle")}>
        <DisableAuthenticatorForm onCancel={() => setDisabling(false)} onSettled={setFeedback} />
      </FormDialog>
    </DetailSection>
  );
}
