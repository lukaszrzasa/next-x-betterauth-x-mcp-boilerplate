"use client";

import { Button } from "@/src/components/ui/button";
import { FormError } from "@/src/components/forms/FormError";
import { useSignOut } from "../../hooks/useSignOut";

export function SignOutButton() {
  const { signOut, pending, error } = useSignOut();

  return (
    <div className="auth-ui ui:space-y-3">
      <Button onClick={signOut} disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      <FormError message={error} />
    </div>
  );
}
