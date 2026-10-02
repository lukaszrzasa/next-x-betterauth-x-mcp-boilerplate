"use client";

import { useRouter } from "next/navigation";
import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { useCatalog } from "@/src/lib/i18n/useCatalog";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { disableAuthenticatorAction } from "@/app/(AuthModule)/_/actions";
import { syncFeedbackFor, type Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import { currentPasswordFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/** Disabling: password, a consequence dialog, then the existing factor's step-up via the runtime. */
export function useDisableAuthenticatorForm({ onSettled }: { onSettled: (feedback: Feedback) => void }) {
  const router = useRouter();
  const t = useCatalog();
  const { form, createSubmitHandler } = useSchemaForm(currentPasswordFormSchema);
  const { execute, isPending } = useAction(disableAuthenticatorAction, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ currentPassword }) => {
    const confirmed = await confirm({
      title: t("auth.settings.authenticator.disableForm.confirm.title"),
      description: t("auth.settings.authenticator.disableForm.confirm.description"),
      confirmLabel: t("auth.settings.authenticator.disableForm.confirm.confirm"),
      destructive: true,
    });
    if (!confirmed) return;
    const result = await execute({ currentPassword });
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["currentPassword"])) return;
      throw new Error(rootMessage(t, result.error));
    }
    const feedback = syncFeedbackFor(t, "disableAuthenticator", result);
    if (!feedback) return;
    form.reset();
    onSettled(feedback);
    router.refresh();
  });

  return { form, onSubmit, pending: isPending || form.formState.isSubmitting };
}
