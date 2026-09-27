"use client";

import { useState } from "react";
import { UserRoundIcon } from "lucide-react";
import { EditButton } from "@/src/components/actions/EditButton";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { FormDialog } from "@/src/components/feedback/FormDialog";
import { ActionFeedback } from "@/src/components/feedback/ActionFeedback";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import { useRetryProfileSessionRefresh } from "@/app/(AuthModule)/_/hooks/settings/actions/useRetryProfileSessionRefresh";
import type { Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { ProfileSettings } from "@/app/(AuthModule)/_/types/settings";
import { DisplayNameForm } from "@/app/(AuthModule)/_/components/settings/profile/DisplayNameForm";

/** The Profile page's only section: the display name, edited in a modal. */
export function ProfileSection({ profile }: { profile: ProfileSettings }) {
  const [editing, setEditing] = useState(false);
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();
  const retry = useRetryProfileSessionRefresh({ onSettled: setFeedback });

  return (
    <DetailSection title="Profile" description="How you appear across the application." icon={UserRoundIcon}>
      <ActionFeedback
        feedback={feedback}
        onDismiss={dismiss}
        recovery={
          feedback?.recovery === "retryProfileSessionRefresh"
            ? { label: "Retry", pending: retry.pending, onClick: () => void retry.run() }
            : undefined
        }
      />
      <div>
        <DetailRow
          label="Display name"
          control={
            <EditButton onClick={() => { dismiss(); setEditing(true); }}>Edit name</EditButton>
          }
        >
          <span className="ui:font-medium">{profile.name}</span>
        </DetailRow>
      </div>
      <FormDialog open={editing} onOpenChange={setEditing} title="Edit your display name">
        <DisplayNameForm name={profile.name} onCancel={() => setEditing(false)} onSettled={setFeedback} />
      </FormDialog>
    </DetailSection>
  );
}
