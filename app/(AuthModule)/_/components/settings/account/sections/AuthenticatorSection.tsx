"use client";

import { useState } from "react";
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
  SETUP_STEP_TITLES,
  type SetupKind,
  type SetupStepName,
} from "@/app/(AuthModule)/_/components/settings/account/AuthenticatorSetupFlow";
import { DisableAuthenticatorForm } from "@/app/(AuthModule)/_/components/settings/account/forms/DisableAuthenticatorForm";

type Flow = { kind: SetupKind; key: number; step: SetupStepName };

/** Marks a factor the account cannot turn off; the reason is in a tooltip, not a native title. */
function RequiredBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0} className="ui:cursor-default">
          Required for your account
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Your role requires an authenticator; it can be replaced but not disabled.</TooltipContent>
    </Tooltip>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  if (enabled) return <Badge variant="secondary">Enabled</Badge>;
  return (
    <Badge variant="outline" className="ui:text-muted-foreground">
      Not set up
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
  if (!account.twoFactorEnabled) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => onStart("enroll")}>
        <ShieldPlusIcon aria-hidden="true" />
        Set up authenticator
      </Button>
    );
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => onStart("replace")}>
        <RefreshCwIcon aria-hidden="true" />
        Replace authenticator
      </Button>
      {!account.twoFactorRequired && (
        <Button type="button" variant="outline" size="sm" onClick={onDisable}>
          <ShieldOffIcon aria-hidden="true" />
          Disable
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
      ? { label: "Retry", pending: retry.pending, onClick: () => void retry.run() }
      : undefined;

  return (
    <DetailSection
      title="Authenticator"
      titleAddon={account.twoFactorRequired ? <RequiredBadge /> : undefined}
      description="A code from an authenticator app at sign-in and for sensitive changes."
      icon={ShieldCheckIcon}
    >
      <ActionFeedback feedback={feedback} onDismiss={dismiss} recovery={recovery} />
      <div>
        <DetailRow
          label="Status"
          control={
            account.emailVerified ? (
              <AuthenticatorControls account={account} onStart={start} onDisable={disable} />
            ) : undefined
          }
        >
          <StatusBadge enabled={account.twoFactorEnabled} />
          {!account.emailVerified && (
            <p className="ui:mt-1 ui:text-xs ui:text-muted-foreground">
              Verify your email address to manage the authenticator.
            </p>
          )}
        </DetailRow>
      </div>

      {flow && (
        <FormDialog
          open
          onOpenChange={(next) => !next && setFlow(null)}
          title={SETUP_STEP_TITLES[flow.kind][flow.step]}
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
      <FormDialog open={disabling} onOpenChange={setDisabling} title="Disable your authenticator">
        <DisableAuthenticatorForm onCancel={() => setDisabling(false)} onSettled={setFeedback} />
      </FormDialog>
    </DetailSection>
  );
}
