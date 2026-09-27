"use client";

import { retryProfileSessionRefreshAction } from "@/app/(AuthModule)/_/actions";
import { useSettingsAction, type SettingsActionOptions } from "./useSettingsAction";

/** Finishes a partial name change by re-syncing the committed row into cached sessions. */
export function useRetryProfileSessionRefresh(options: SettingsActionOptions) {
  const { run, pending } = useSettingsAction("retryProfileSessionRefresh", retryProfileSessionRefreshAction, options);
  return { run: () => run(undefined), pending };
}
