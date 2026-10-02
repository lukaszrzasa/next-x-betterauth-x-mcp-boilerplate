"use client";

import { useTranslations } from "next-intl";
import { authClient } from "@/src/lib/auth/client";
import { useOperationStatus } from "@/src/lib/hooks/useOperationStatus";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSessionRedirect } from "./useSessionRedirect";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export function useSignOut() {
  const t = useTranslations("auth.signOut");
  const signOutFailedMessage = t("failed");
  const redirect = useSessionRedirect();
  const { pending, error, start, succeed, fail } = useOperationStatus();

  async function signOut() {
    start();

    try {
      unwrapAuthResult(await authClient.signOut(), signOutFailedMessage);
      succeed();
      redirect(authRoutes.signIn.href);
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : signOutFailedMessage);
    }
  }

  return { signOut, pending, error: error ?? undefined };
}
