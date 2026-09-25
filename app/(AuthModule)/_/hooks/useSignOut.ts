"use client";

import { authClient } from "@/src/lib/auth/client";
import { useOperationStatus } from "@/src/lib/hooks/useOperationStatus";
import { unwrapAuthResult } from "@/app/(AuthModule)/_/utils/unwrapAuthResult";
import { useSessionRedirect } from "./useSessionRedirect";
import { authRoutes } from "@/src/lib/auth/routes";

const signOutFailedMessage = "Unable to sign out. Please try again.";

export function useSignOut() {
  const redirect = useSessionRedirect();
  const { pending, error, start, succeed, fail } = useOperationStatus();

  async function signOut() {
    start();

    try {
      unwrapAuthResult(await authClient.signOut(), signOutFailedMessage);
      succeed();
      redirect(authRoutes.signIn);
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : signOutFailedMessage);
    }
  }

  return { signOut, pending, error: error ?? undefined };
}
