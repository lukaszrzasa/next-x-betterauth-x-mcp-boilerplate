"use client";

import { useState } from "react";
import { PencilIcon, UserRoundIcon } from "lucide-react";
import { DetailRow, DetailSection } from "@/src/components/detail/DetailSection";
import { Button } from "@/src/components/ui/button";
import { useRetryEmailChangeEffects } from "@/app/(AuthModule)/admin/_/hooks/actions/useRetryEmailChangeEffects";
import { useRetryNameSessionRefresh } from "@/app/(AuthModule)/admin/_/hooks/actions/useRetryNameSessionRefresh";
import { useActionFeedback } from "@/app/(AuthModule)/admin/_/hooks/useActionFeedback";
import type { Feedback } from "@/app/(AuthModule)/admin/_/hooks/feedback";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";
import { UserEmailForm } from "@/app/(AuthModule)/admin/_/components/users/detail/forms/UserEmailForm";
import { UserNameForm } from "@/app/(AuthModule)/admin/_/components/users/detail/forms/UserNameForm";
import { policyNote } from "@/app/(AuthModule)/admin/_/components/users/detail/policyNote";
import { UserActionFeedback } from "@/app/(AuthModule)/admin/_/components/users/detail/UserActionFeedback";

type Editing = "name" | "email" | null;

/**
 * Name and email, each read-only until its Edit button is pressed and each
 * saved on its own: at most one field is being edited, and saving one never
 * submits the other. A partial save offers the matching recovery here.
 */
export function UserProfileSection({ user }: { user: UserDetail }) {
  const [editing, setEditing] = useState<Editing>(null);
  const { feedback, setFeedback, dismiss } = useActionFeedback();
  const retryNameSessionRefresh = useRetryNameSessionRefresh(user.id, { onSettled: setFeedback });
  const retryEmailChangeEffects = useRetryEmailChangeEffects(user.id, { onSettled: setFeedback });
  const recovery = {
    retryNameSessionRefresh,
    retryEmailChangeEffects,
  }[feedback?.recovery as "retryNameSessionRefresh" | "retryEmailChangeEffects"];
  const anyPending = retryNameSessionRefresh.pending || retryEmailChangeEffects.pending;
  const name = user.capabilities.updateName;
  const email = user.capabilities.updateEmail;

  /** A saved field returns to read mode; a failed one stays open with its values. */
  const settled = (next: Feedback) => {
    setFeedback(next);
    if (next.tone !== "error") setEditing(null);
  };

  const editButton = (field: Exclude<Editing, null>, label: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={editing !== null || anyPending}
      onClick={() => {
        dismiss();
        setEditing(field);
      }}
    >
      <PencilIcon aria-hidden="true" />
      {label}
    </Button>
  );

  return (
    <DetailSection
      title="Profile"
      description="The account's display name and sign-in email address."
      icon={UserRoundIcon}
    >
      <UserActionFeedback
        feedback={feedback}
        onDismiss={dismiss}
        recovery={
          recovery ? { label: "Retry", pending: recovery.pending, onClick: () => void recovery.run() } : undefined
        }
      />
      <div>
        <DetailRow
          label="Name"
          control={editing !== "name" && name.allowed ? editButton("name", "Edit name") : undefined}
        >
          {editing === "name" ? (
            <UserNameForm user={user} onCancel={() => setEditing(null)} onSettled={settled} />
          ) : (
            <>
              <span className="ui:font-medium">{user.name}</span>
              {!name.allowed && policyNote(name.reason) && (
                <p className="ui:mt-1 ui:text-xs ui:text-muted-foreground">{policyNote(name.reason)}</p>
              )}
            </>
          )}
        </DetailRow>
        <DetailRow
          label="Email address"
          control={editing !== "email" && email.allowed ? editButton("email", "Edit email") : undefined}
        >
          {editing === "email" ? (
            <UserEmailForm user={user} onCancel={() => setEditing(null)} onSettled={settled} />
          ) : (
            <>
              <span className="ui:font-medium ui:break-all">{user.email}</span>
              {!email.allowed && policyNote(email.reason) && (
                <p className="ui:mt-1 ui:text-xs ui:text-muted-foreground">{policyNote(email.reason)}</p>
              )}
            </>
          )}
        </DetailRow>
      </div>
    </DetailSection>
  );
}
