"use client";

import { useRouter } from "next/navigation";
import { useCatalog } from "@/src/lib/i18n/useCatalog";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { beginEmailCorrectionAction } from "@/app/(AuthModule)/_/actions";
import { describeEmailRequestOutcome, type Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import { emailCorrectionFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/**
 * Correcting an unverified address: the corrected address, the password and,
 * for an enrolled account, the current authenticator code. Only the corrected
 * mailbox is ever mailed. Success shows the pending status.
 */
export function useEmailCorrectionForm({ onSettled }: { onSettled: (feedback: Feedback) => void }) {
  const router = useRouter();
  const t = useCatalog();
  const { form, createSubmitHandler } = useSchemaForm(emailCorrectionFormSchema);
  const { execute, isPending } = useAction(beginEmailCorrectionAction, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ newEmail, currentPassword, authenticatorCode }) => {
    const result = await execute({ newEmail, currentPassword, authenticatorCode });
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["newEmail", "currentPassword", "authenticatorCode"])) return;
      if (result.error.reason === "STEP_UP_INVALID_CODE" || result.error.reason === "STEP_UP_LOCKED") {
        form.setError("authenticatorCode", { type: "server", message: result.error.message }, { shouldFocus: true });
        return;
      }
      throw new Error(rootMessage(t, result.error));
    }
    if (result.status !== "success") return;
    form.reset();
    onSettled(describeEmailRequestOutcome(t, result.data));
    router.refresh();
  });

  return { form, onSubmit, pending: isPending || form.formState.isSubmitting };
}
