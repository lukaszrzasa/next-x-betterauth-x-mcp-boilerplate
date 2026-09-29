"use client";

import { useWatch } from "react-hook-form";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { updateUserNameAction } from "@/app/(AuthModule)/admin/_/actions";
import {
  describeUserFailure,
  feedbackFor,
  readFieldError,
  type Feedback,
} from "@/app/(AuthModule)/admin/_/hooks/feedback";
import { useAccountRefresh } from "@/app/(AuthModule)/admin/_/hooks/useAccountRefresh";
import { userNameFormSchema } from "@/app/(AuthModule)/admin/_/schema";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";

/**
 * Editing the name alone: the form carries one field, the action receives
 * `{ userId, name }` and nothing else. Field refusals land on the field;
 * every other refusal becomes the form's root error. A saved change
 * refreshes the page and reports the outcome through `onSettled`.
 */
export function useUserNameForm({
  user,
  onSettled,
}: {
  user: UserDetail;
  onSettled: (feedback: Feedback) => void;
}) {
  const refresh = useAccountRefresh();
  const { form, createSubmitHandler } = useSchemaForm(userNameFormSchema, { name: user.name });
  const { execute, isPending } = useAction(updateUserNameAction, {
    onError: (error) => {
      if (readFieldError(error)?.field === "name") {
        form.setError("name", { type: "server", message: error.message }, { shouldFocus: true });
      }
      return true;
    },
  });
  const value = useWatch({ control: form.control, name: "name" });
  const unchanged = value.trim() === user.name;

  const onSubmit = createSubmitHandler(async ({ name }) => {
    const result = await execute({ userId: user.id, name });
    if (result.status === "error") {
      if (readFieldError(result.error)?.field === "name") return;
      const { description, title } = describeUserFailure(result.error);
      throw new Error(description ?? title);
    }
    const feedback = feedbackFor("updateName", result);
    if (!feedback) return;
    onSettled(feedback);
    if (result.status === "success" && result.data.status !== "unchanged") refresh();
  });

  const reset = () => form.reset({ name: user.name });

  return { form, onSubmit, reset, unchanged, pending: isPending || form.formState.isSubmitting };
}
