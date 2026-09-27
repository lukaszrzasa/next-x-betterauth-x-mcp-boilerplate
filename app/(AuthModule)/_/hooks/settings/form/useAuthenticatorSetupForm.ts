"use client";

import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { beginEnrollmentAction, beginReplacementAction } from "@/app/(AuthModule)/_/actions";
import { currentPasswordFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { SetupStarted } from "@/app/(AuthModule)/_/types/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/**
 * The password step of an authenticator setup: first enrollment or a staged
 * replacement (whose existing-factor step-up the runtime prompts for). The
 * setup material lands in this hook's action result; mount it inside the
 * disposable flow so closing the flow discards it.
 */
export function useAuthenticatorSetupForm({
  kind,
  onStarted,
}: {
  kind: "enroll" | "replace";
  onStarted: (setup: SetupStarted) => void;
}) {
  const action = kind === "enroll" ? beginEnrollmentAction : beginReplacementAction;
  const { form, createSubmitHandler } = useSchemaForm(currentPasswordFormSchema);
  const { execute, isPending } = useAction(action, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ currentPassword }) => {
    const result = await execute({ currentPassword });
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["currentPassword"])) return;
      throw new Error(rootMessage(result.error));
    }
    if (result.status !== "success") return;
    form.reset();
    onStarted(result.data);
  });

  return { form, onSubmit, pending: isPending || form.formState.isSubmitting };
}
