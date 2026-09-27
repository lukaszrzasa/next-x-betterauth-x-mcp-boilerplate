"use client";

import { revokeOtherSessionsAction } from "@/app/(AuthModule)/_/actions";
import { useSettingsAction, type SettingsActionOptions } from "./useSettingsAction";

/** Signs every other device out; also the recovery for its own partial outcome. */
export function useRevokeOtherSessions(options: SettingsActionOptions) {
  const { run, pending } = useSettingsAction("revokeOtherSessions", revokeOtherSessionsAction, options);
  return { run: () => run(undefined), pending };
}
