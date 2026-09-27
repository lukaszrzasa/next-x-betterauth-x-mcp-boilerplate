"use client";

import { revokeSessionAction } from "@/app/(AuthModule)/_/actions";
import { useSettingsAction, type SettingsActionOptions } from "./useSettingsAction";

/** Signs one other session out, by its public ID; ownership is checked server-side. */
export function useRevokeSession(options: SettingsActionOptions) {
  const { run, pending } = useSettingsAction("revokeSession", revokeSessionAction, options);
  return { run: (sessionId: string) => run({ sessionId }), pending };
}
