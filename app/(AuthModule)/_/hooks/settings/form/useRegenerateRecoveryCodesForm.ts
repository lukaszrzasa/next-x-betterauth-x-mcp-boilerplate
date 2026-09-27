"use client";

import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { regenerateRecoveryCodesAction } from "@/app/(AuthModule)/_/actions";
import { currentPasswordFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { RecoveryCodesIssued } from "@/app/(AuthModule)/_/types/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/**
 * Replacement recovery codes: password, an explicit "previous codes stop
 * working" confirmation, then the existing step-up via the runtime. The
 * codes land in this hook's action result; mount it inside the disposable
 * flow so acknowledging them discards the only copy.
 */
export function useRegenerateRecoveryCodesForm({ onIssued }: { onIssued: (issued: RecoveryCodesIssued) => void }) {
  const { form, createSubmitHandler } = useSchemaForm(currentPasswordFormSchema);
  const { execute, isPending } = useAction(regenerateRecoveryCodesAction, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ currentPassword }) => {
    const confirmed = await confirm({
      title: "Generate new recovery codes?",
      description:
        "Your previous recovery codes immediately stop working. The new set is shown once; save it before closing.",
      confirmLabel: "Generate new codes",
    });
    if (!confirmed) return;
    const result = await execute({ currentPassword });
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["currentPassword"])) return;
      throw new Error(rootMessage(result.error));
    }
    if (result.status !== "success") return;
    form.reset();
    onIssued(result.data);
  });

  return { form, onSubmit, pending: isPending || form.formState.isSubmitting };
}
