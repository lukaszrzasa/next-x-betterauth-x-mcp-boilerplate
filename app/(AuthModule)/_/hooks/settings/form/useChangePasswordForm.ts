"use client";

import { useRouter } from "next/navigation";
import { useCatalog } from "@/src/lib/i18n/useCatalog";
import { useAction } from "@/src/lib/actions";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { changePasswordAction } from "@/app/(AuthModule)/_/actions";
import { syncFeedbackFor, type Feedback } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import { changePasswordFormSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { attributeFieldError, rootMessage } from "./formErrors";

/**
 * The password change. The confirmation field never leaves the browser; the
 * checkbox (default on) maps directly to the provider's other-session
 * revocation. Fields are cleared after success; a transport uncertainty is
 * reported as refresh-before-retry guidance, never retried on its own.
 */
export function useChangePasswordForm({ onSettled }: { onSettled: (feedback: Feedback) => void }) {
  const router = useRouter();
  const t = useCatalog();
  const { form, createSubmitHandler } = useSchemaForm(changePasswordFormSchema);
  const { execute, isPending } = useAction(changePasswordAction, { onError: () => true });

  const onSubmit = createSubmitHandler(async ({ currentPassword, newPassword, revokeOtherSessions }) => {
    const result = await execute({ currentPassword, newPassword, revokeOtherSessions });
    if (result.status === "error") {
      if (attributeFieldError(form, result.error, ["currentPassword", "newPassword"])) return;
      throw new Error(rootMessage(t, result.error));
    }
    const feedback = syncFeedbackFor(t, "changePassword", result);
    if (!feedback) return;
    // Never keep either password around after the server answered.
    form.reset({ currentPassword: "", newPassword: "", confirmNewPassword: "", revokeOtherSessions });
    onSettled(feedback);
    router.refresh();
  });

  return { form, onSubmit, pending: isPending || form.formState.isSubmitting };
}
