"use client";

import { LogOutIcon, MonitorSmartphoneIcon } from "lucide-react";
import { DetailSection } from "@/src/components/detail/DetailSection";
import { Button } from "@/src/components/ui/button";
import { ActionFeedback } from "@/src/components/feedback/ActionFeedback";
import { useSessionRevocation } from "@/app/(AuthModule)/_/hooks/settings/actions/useSessionRevocation";
import type { SessionPage } from "@/app/(AuthModule)/_/types/settings";
import { SessionList } from "@/app/(AuthModule)/_/components/settings/account/SessionList";

/** Where the account is signed in, and the three ways to end sessions. */
export function SessionsSection({ sessions }: { sessions: SessionPage }) {
  const revocation = useSessionRevocation();
  const hasOthers = sessions.total > 1;

  return (
    <DetailSection
      title="Sessions"
      description="Devices and browsers currently signed in to your account."
      icon={MonitorSmartphoneIcon}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={revocation.pending || !hasOthers}
            onClick={revocation.signOutOthers}
          >
            <LogOutIcon aria-hidden="true" />
            Sign out other devices
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={revocation.pending}
            onClick={revocation.signOutEverywhere}
          >
            Sign out everywhere
          </Button>
        </>
      }
    >
      <ActionFeedback feedback={revocation.feedback} onDismiss={revocation.dismiss} recovery={revocation.recovery} />
      <SessionList sessions={sessions} pending={revocation.pending} onRevoke={revocation.signOutSession} />
    </DetailSection>
  );
}
