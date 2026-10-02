"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { FormError } from "@/src/components/forms/FormError";
import { useSignOut } from "@/app/(AuthModule)/_/hooks/useSignOut";

export function SignOutButton() {
  const t = useTranslations("auth.signOut");
  const { signOut, pending, error } = useSignOut();

  return (
    <div className="ui:space-y-3">
      <Button onClick={signOut} disabled={pending}>
        {pending ? t("pending") : t("button")}
      </Button>
      <FormError message={error} />
    </div>
  );
}
