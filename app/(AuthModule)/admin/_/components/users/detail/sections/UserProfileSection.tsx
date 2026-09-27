"use client";

import { useState } from "react";
import { UserRoundIcon } from "lucide-react";
import { EditButton } from "@/src/components/actions/EditButton";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { FormDialog } from "@/src/components/feedback/FormDialog";
import { ActionFeedback } from "@/src/components/feedback/ActionFeedback";
import { useFeedback } from "@/src/lib/hooks/useFeedback";
import { useRetryEmailChangeEffects } from "@/app/(AuthModule)/admin/_/hooks/actions/useRetryEmailChangeEffects";
import { useRetryNameSessionRefresh } from "@/app/(AuthModule)/admin/_/hooks/actions/useRetryNameSessionRefresh";
import type { Feedback } from "@/app/(AuthModule)/admin/_/hooks/feedback";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";
import { UserEmailForm } from "@/app/(AuthModule)/admin/_/components/users/detail/forms/UserEmailForm";
import { UserNameForm } from "@/app/(AuthModule)/admin/_/components/users/detail/forms/UserNameForm";
import { policyNote } from "@/app/(AuthModule)/admin/_/components/users/detail/policyNote";

type Editing = "name" | "email" | null;

/**
 * Name and email, read-only, each edited in its own modal and saved on its
 * own: saving one never submits the other. A partial save offers the
 * matching recovery here.
 */
export function UserProfileSection({ user }: { user: UserDetail }) {
  const [editing, setEditing] = useState<Editing>(null);
  const { feedback, setFeedback, dismiss } = useFeedback<Feedback>();
  const retryNameSessionRefresh = useRetryNameSessionRefresh(user.id, { onSettled: setFeedback });
  const retryEmailChangeEffects = useRetryEmailChangeEffects(user.id, { onSettled: setFeedback });
  const recovery = {
    retryNameSessionRefresh,
    retryEmailChangeEffects,
  }[feedback?.recovery as "retryNameSessionRefresh" | "retryEmailChangeEffects"];
  const anyPending = retryNameSessionRefresh.pending || retryEmailChangeEffects.pending;
  const name = user.capabilities.updateName;
  const email = user.capabilities.updateEmail;
  const close = () => setEditing(null);

  /** A saved field closes its modal; a failed one stays open with its values. */
  const settled = (next: Feedback) => {
    setFeedback(next);
    if (next.tone !== "error") setEditing(null);
  };

  const open = (field: Exclude<Editing, null>) => {
    dismiss();
    setEditing(field);
  };

  return (
    <DetailSection
      title="Profile"
      description="The account's display name and sign-in email address."
      icon={UserRoundIcon}
    >
      <ActionFeedback
        retryVerb="send again"
        feedback={feedback}
        onDismiss={dismiss}
        recovery={
          recovery ? { label: "Retry", pending: recovery.pending, onClick: () => void recovery.run() } : undefined
        }
      />
      <div>
        <DetailRow
          label="Name"
          control={
            name.allowed ? (
              <EditButton disabled={anyPending} onClick={() => open("name")}>
                Edit name
              </EditButton>
            ) : undefined
          }
        >
          <span className="ui:font-medium">{user.name}</span>
          {!name.allowed && policyNote(name.reason) && (
            <p className="ui:mt-1 ui:text-xs ui:text-muted-foreground">{policyNote(name.reason)}</p>
          )}
        </DetailRow>
        <DetailRow
          label="Email address"
          control={
            email.allowed ? (
              <EditButton disabled={anyPending} onClick={() => open("email")}>
                Edit email
              </EditButton>
            ) : undefined
          }
        >
          <span className="ui:font-medium ui:break-all">{user.email}</span>
          {!email.allowed && policyNote(email.reason) && (
            <p className="ui:mt-1 ui:text-xs ui:text-muted-foreground">{policyNote(email.reason)}</p>
          )}
        </DetailRow>
      </div>
      <FormDialog open={editing === "name"} onOpenChange={(next) => !next && close()} title="Edit name">
        <UserNameForm user={user} onCancel={close} onSettled={settled} />
      </FormDialog>
      <FormDialog open={editing === "email"} onOpenChange={(next) => !next && close()} title="Edit email address">
        <UserEmailForm user={user} onCancel={close} onSettled={settled} />
      </FormDialog>
    </DetailSection>
  );
}
