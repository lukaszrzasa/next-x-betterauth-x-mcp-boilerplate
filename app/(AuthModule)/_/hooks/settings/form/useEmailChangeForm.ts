"use client";

import { useRouter } from "next/navigation";
import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { beginEmailChangeAction } from "@/app/(AuthModule)/_/actions";
import { describeEmailRequestOutcome, type Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import { emailChangeFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/**
 * Starting a verified-address change: the current address is shown read-only
 * (the server reads it itself), the password is the only input. A
 * consequence dialog precedes the request, whose enrolled-only step-up the
 * shared runtime prompts for. Success shows the pending status.
 */
export function useEmailChangeForm({
  email,
  replacing,
  onSettled,
}: {
  email: string;
  /** A request is already active and will be cancelled by this one. */
  replacing: boolean;
  onSettled: (feedback: Feedback) => void;
}) {
  const router = useRouter();
  const { form, createSubmitHandler } = useSchemaForm(emailChangeFormSchema);
  const { execute, isPending } = useAction(beginEmailChangeAction, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ currentPassword }) => {
    const confirmed = await confirm({
      title: replacing ? "Start a new email change?" : "Change your sign-in email?",
      description: `${replacing ? "The current request is cancelled and its links stop working. " : ""}A confirmation link is sent to ${email}. After confirming it you will choose the new address here, and the new mailbox confirms it as well. Nothing changes until then; the request expires after 24 hours.`,
      confirmLabel: replacing ? "Start over" : "Send confirmation",
      cancelLabel: "Keep current address",
    });
    if (!confirmed) return;

    const result = await execute({ currentPassword });
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["currentPassword"])) return;
      throw new Error(rootMessage(result.error));
    }
    if (result.status !== "success") return;
    form.reset();
    onSettled(describeEmailRequestOutcome(result.data));
    router.refresh();
  });

  return { form, onSubmit, pending: isPending || form.formState.isSubmitting };
}
