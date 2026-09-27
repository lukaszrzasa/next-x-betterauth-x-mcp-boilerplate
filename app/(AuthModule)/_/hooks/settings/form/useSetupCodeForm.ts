"use client";

import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { confirmEnrollmentAction, confirmReplacementAction } from "@/app/(AuthModule)/_/actions";
import { readLifecycleCode } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import { setupCodeFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { RecoveryCodesIssued } from "@/app/(AuthModule)/_/types/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/**
 * The proof step: a code from the *new* authenticator completes the attempt.
 * For a replacement the runtime may first ask for the existing factor again
 * when the earlier grant lapsed; the two codes serve different purposes.
 */
export function useSetupCodeForm({
  kind,
  requestId,
  onCompleted,
  onClosed,
}: {
  kind: "enroll" | "replace";
  requestId: string;
  onCompleted: (issued: RecoveryCodesIssued) => void;
  /** The attempt is gone (expired, replaced): the flow must start over. */
  onClosed: (message: string) => void;
}) {
  const action = kind === "enroll" ? confirmEnrollmentAction : confirmReplacementAction;
  const { form, createSubmitHandler } = useSchemaForm(setupCodeFormSchema);
  const { execute, isPending } = useAction(action, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ code }) => {
    const result = await execute({ requestId, code });
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["code"])) return;
      const lifecycle = readLifecycleCode(result.error);
      if (lifecycle === "EXPIRED" || lifecycle === "SETUP_REPLACED" || lifecycle === "SECURITY_STATE_CHANGED") {
        onClosed(rootMessage(result.error));
        return;
      }
      throw new Error(rootMessage(result.error));
    }
    if (result.status !== "success") return;
    form.reset();
    onCompleted(result.data);
  });

  return { form, onSubmit, pending: isPending || form.formState.isSubmitting };
}
