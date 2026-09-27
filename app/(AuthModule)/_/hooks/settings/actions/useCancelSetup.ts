"use client";

import { useAction } from "@/src/lib/actions";
import { cancelSetupAction } from "@/app/(AuthModule)/_/actions";

/** Abandons a pending authenticator setup; failures are not blocking, the attempt expires anyway. */
export function useCancelSetup() {
  const { execute, isPending } = useAction(cancelSetupAction, { onError: () => true });
  return { cancel: (requestId: string) => execute({ requestId }), pending: isPending };
}
