"use client";

import { revokeAllSessionsAction } from "@/app/(AuthModule)/_/actions";
import { useSettingsAction, type SettingsActionOptions } from "./useSettingsAction";

/** Signs out everywhere, this device included; success navigates to sign-in. */
export function useRevokeAllSessions(options: SettingsActionOptions) {
  const { run, pending } = useSettingsAction("revokeAllSessions", revokeAllSessionsAction, options);
  return { run: () => run(undefined), pending };
}
