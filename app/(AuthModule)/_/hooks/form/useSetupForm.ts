"use client";

import { useState } from "react";
import { useAction } from "@/src/lib/actions";
import { authClient } from "@/src/lib/auth/client";
import { setupRootAdminAction } from "@/app/(AuthModule)/_/actions";
import { signUpSchema } from "@/app/(AuthModule)/_/schema";
import { useSchemaForm } from "@/src/lib/forms/useSchemaForm";
import { useSessionRedirect } from "@/app/(AuthModule)/_/hooks/useSessionRedirect";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/** Creates the root administrator, then signs them in and sends them to enrollment. */
export function useSetupForm() {
  const redirect = useSessionRedirect();
  const [rootAdminCreated, setRootAdminCreated] = useState(false);
  const { form, createSubmitHandler } = useSchemaForm(signUpSchema);
  const setupRootAdmin = useAction(setupRootAdminAction, {
    // Returning true marks the error handled, so it stays on the form instead of the global reporter.
    onError: (error) => {
      form.setError("root", { message: error.message });
      return true;
    },
  });

  const onSubmit = createSubmitHandler(async ({ name, email, password }) => {
    const result = await setupRootAdmin.execute({ name, email, password });

    if (result.status !== "success") {
      return;
    }

    setRootAdminCreated(true);

    // Best effort: the account exists either way, and the created view links to manual sign-in.
    const signIn = await authClient.signIn.email({ email, password });

    if (!signIn.error) {
      redirect(authRoutes.enroll.href);
    }
  });

  return { form, onSubmit, rootAdminCreated };
}
