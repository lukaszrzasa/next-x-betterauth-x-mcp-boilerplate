"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { confirm } from "@/src/components/feedback/ConfirmDialog";
import { useCatalog } from "@/src/lib/i18n/useCatalog";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { beginEmailChangeAction } from "@/app/(AuthModule)/_/actions";
import { describeEmailRequestOutcome, type Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import { emailChangeFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/**
 * Starting a verified-address change: the current address is shown read-only
 * (the server reads it itself), the password is the only input. A
 * consequence dialog precedes the request, whose enrolled-only step-up the
 * shared runtime prompts for. Success shows the pending status.
 */
export function useEmailChangeForm({
  email,
  replacing,
  onSettled,
}: {
  email: string;
  /** A request is already active and will be cancelled by this one. */
  replacing: boolean;
  onSettled: (feedback: Feedback) => void;
}) {
  const router = useRouter();
  const t = useCatalog();
  const tForm = useTranslations("auth.settings.email.changeForm.confirm");
  const { form, createSubmitHandler } = useSchemaForm(emailChangeFormSchema);
  const { execute, isPending } = useAction(beginEmailChangeAction, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ currentPassword }) => {
    const confirmed = await confirm({
      title: replacing ? tForm("titleNew") : tForm("title"),
      description: tForm("description", { prefix: replacing ? tForm("replacing") : "", email }),
      confirmLabel: replacing ? tForm("confirmNew") : tForm("confirm"),
      cancelLabel: tForm("keep"),
    });
    if (!confirmed) return;

    const result = await execute({ currentPassword });
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["currentPassword"])) return;
      throw new Error(rootMessage(t, result.error));
    }
    if (result.status !== "success") return;
    form.reset();
    onSettled(describeEmailRequestOutcome(t, result.data));
    router.refresh();
  });

  return { form, onSubmit, pending: isPending || form.formState.isSubmitting };
}
