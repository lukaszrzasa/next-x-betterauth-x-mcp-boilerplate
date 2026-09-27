"use client";

import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { updateDisplayNameAction } from "@/app/(AuthModule)/_/actions";
import { syncFeedbackFor, type Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import { displayNameFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/** Editing the display name alone; a saved change refreshes the shell identity and the page. */
export function useDisplayNameForm({ name, onSettled }: { name: string; onSettled: (feedback: Feedback) => void }) {
  const router = useRouter();
  const { form, createSubmitHandler } = useSchemaForm(displayNameFormSchema, { name });
  const { execute, isPending } = useAction(updateDisplayNameAction, { onError: () => true });
  const value = useWatch({ control: form.control, name: "name" });
  const unchanged = (value ?? "").trim() === name;

  const onSubmit = createSubmitHandler(async (input) => {
    const result = await execute(input);
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["name"])) return;
      throw new Error(rootMessage(result.error));
    }
    const feedback = syncFeedbackFor("updateName", result);
    if (!feedback) return;
    onSettled(feedback);
    if (result.status === "success" && result.data.status !== "unchanged") router.refresh();
  });

  return { form, onSubmit, reset: () => form.reset({ name }), unchanged, pending: isPending || form.formState.isSubmitting };
}
