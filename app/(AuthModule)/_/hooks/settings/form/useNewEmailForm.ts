"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { selectNewEmailAction } from "@/app/(AuthModule)/_/actions";
import { describeEmailRequestOutcome, type Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import { newEmailFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/** Choosing the destination once the current mailbox agreed; no password is repeated within the request. */
export function useNewEmailForm({ requestId, onSettled }: { requestId: string; onSettled: (feedback: Feedback) => void }) {
  const router = useRouter();
  const { form, createSubmitHandler } = useSchemaForm(newEmailFormSchema);
  const { execute, isPending } = useAction(selectNewEmailAction, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ newEmail }) => {
    const result = await execute({ requestId, newEmail });
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["newEmail"])) return;
      if (result.error.reason === "NOT_FOUND" || result.error.reason === "CONFLICT") router.refresh();
      throw new Error(rootMessage(result.error));
    }
    if (result.status !== "success") return;
    onSettled(describeEmailRequestOutcome(result.data));
    router.refresh();
  });

  return { form, onSubmit, pending: isPending || form.formState.isSubmitting };
}
