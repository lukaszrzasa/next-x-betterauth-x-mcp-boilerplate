"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { banUserAction } from "@/app/(AuthModule)/admin/_/actions";
import {
  describeUserFailure,
  feedbackFor,
  readFieldError,
  type Feedback,
} from "@/app/(AuthModule)/admin/_/hooks/feedback";
import { userBanFormSchema } from "@/app/(AuthModule)/admin/_/schema";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";

/**
 * Applying or replacing a ban. The dialog's submit is the confirmation; the
 * action's five-minute step-up is prompted by the shared runtime. Duration
 * starts unselected and reason empty, so nothing is banned by accident.
 */
export function useUserBanForm({
  user,
  onSettled,
}: {
  user: UserDetail;
  onSettled: (feedback: Feedback) => void;
}) {
  const router = useRouter();
  const { form, createSubmitHandler } = useSchemaForm(userBanFormSchema, { reason: "" });
  const { execute, isPending } = useAction(banUserAction, {
    onError: (error) => {
      const field = readFieldError(error);
      if (field?.field === "reason" || field?.field === "duration") {
        form.setError(field.field, { type: "server", message: error.message }, { shouldFocus: true });
      }
      return true;
    },
  });

  const onSubmit = createSubmitHandler(async (input) => {
    const result = await execute({ userId: user.id, ...input });
    if (result.status === "error") {
      if (readFieldError(result.error)) return;
      const { description, title } = describeUserFailure(result.error);
      throw new Error(description ?? title);
    }
    const feedback = feedbackFor("ban", result);
    if (!feedback) return;
    onSettled(feedback);
    if (result.status === "success" && result.data.status !== "unchanged") router.refresh();
  });

  const reset = () => form.reset({ reason: "" });

  return { form, onSubmit, reset, pending: isPending || form.formState.isSubmitting };
}
