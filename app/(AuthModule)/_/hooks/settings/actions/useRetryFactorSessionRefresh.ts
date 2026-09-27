"use client";

import { retryFactorSessionRefreshAction } from "@/app/(AuthModule)/_/actions";
import { useSettingsAction, type SettingsActionOptions } from "./useSettingsAction";

/** Finishes a partial factor change by re-syncing the committed row into cached sessions. */
export function useRetryFactorSessionRefresh(options: SettingsActionOptions) {
  const { run, pending } = useSettingsAction("retryFactorSessionRefresh", retryFactorSessionRefreshAction, options);
  return { run: () => run(undefined), pending };
}
