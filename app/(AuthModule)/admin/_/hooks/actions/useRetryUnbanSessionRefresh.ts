"use client";

import { retryUnbanSessionRefreshAction } from "@/app/(AuthModule)/admin/_/actions";
import { useUserMutation, type UserMutationOptions } from "./useUserMutation";

/** Finishes a partial unban: refreshes the cached user copies. */
export function useRetryUnbanSessionRefresh(userId: string, options: UserMutationOptions) {
  const { run, pending } = useUserMutation("retryUnbanSessionRefresh", retryUnbanSessionRefreshAction, options);
  return { run: () => run({ userId }), pending };
}
