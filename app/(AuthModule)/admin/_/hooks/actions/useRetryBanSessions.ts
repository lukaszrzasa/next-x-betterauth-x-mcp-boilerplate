"use client";

import { retryBanSessionsAction } from "@/app/(AuthModule)/admin/_/actions";
import { useUserMutation, type UserMutationOptions } from "./useUserMutation";

/** Finishes a partial ban: revokes sessions without changing the ban. */
export function useRetryBanSessions(userId: string, options: UserMutationOptions) {
  const { run, pending } = useUserMutation("retryBanSessions", retryBanSessionsAction, options);
  return { run: () => run({ userId }), pending };
}
