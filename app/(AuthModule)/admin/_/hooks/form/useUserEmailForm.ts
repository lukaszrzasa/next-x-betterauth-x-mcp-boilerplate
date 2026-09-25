"use client";

import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { updateUserEmailAction } from "@/app/(AuthModule)/admin/_/actions";
import {
  describeUserFailure,
  feedbackFor,
  readFieldError,
  type Feedback,
} from "@/app/(AuthModule)/admin/_/hooks/feedback";
import { userEmailFormSchema } from "@/app/(AuthModule)/admin/_/schema";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";

/**
 * Editing the email alone. Submitting validates, then asks for confirmation
 * that spells out the consequences (the new address is unverified, the user
 * is signed out everywhere); confirming runs the action, whose five-minute
 * step-up the shared runtime prompts for. An address already in use is a
 * field error; the form keeps what was typed.
 */
export function useUserEmailForm({
  user,
  onSettled,
}: {
  user: UserDetail;
  onSettled: (feedback: Feedback) => void;
}) {
  const router = useRouter();
  const { form, createSubmitHandler } = useSchemaForm(userEmailFormSchema, { email: user.email });
  const { execute, isPending } = useAction(updateUserEmailAction, {
    onError: (error) => {
      if (readFieldError(error)?.field === "email") {
        form.setError("email", { type: "server", message: error.message }, { shouldFocus: true });
      }
      return true;
    },
  });
  const value = useWatch({ control: form.control, name: "email" });
  const unchanged = value.trim().toLowerCase() === user.email;

  const onSubmit = createSubmitHandler(async ({ email }) => {
    const confirmed = await confirm({
      title: "Change email address?",
      description: `${user.name}'s address will change from ${user.email} to ${email}. The new address starts unverified, every current session is signed out, and a verification email is sent to the new address. You will be asked to verify your identity.`,
      confirmLabel: "Change email",
      cancelLabel: "Keep current address",
    });
    if (!confirmed) return;

    const result = await execute({ userId: user.id, email });
    if (result.status === "error") {
      if (readFieldError(result.error)?.field === "email") return;
      const { description, title } = describeUserFailure(result.error);
      throw new Error(description ?? title);
    }
    const feedback = feedbackFor("updateEmail", result);
    if (!feedback) return;
    onSettled(feedback);
    if (result.status === "success" && result.data.status !== "unchanged") router.refresh();
  });

  const reset = () => form.reset({ email: user.email });

  return { form, onSubmit, reset, unchanged, pending: isPending || form.formState.isSubmitting };
}
