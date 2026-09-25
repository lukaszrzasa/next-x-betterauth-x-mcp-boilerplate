"use client";

import { retryNameSessionRefreshAction } from "@/app/(AuthModule)/admin/_/actions";
import { useUserMutation, type UserMutationOptions } from "./useUserMutation";

/** Finishes a partial name change: refreshes the cached user copies. */
export function useRetryNameSessionRefresh(userId: string, options: UserMutationOptions) {
  const { run, pending } = useUserMutation("retryNameSessionRefresh", retryNameSessionRefreshAction, options);
  return { run: () => run({ userId }), pending };
}
