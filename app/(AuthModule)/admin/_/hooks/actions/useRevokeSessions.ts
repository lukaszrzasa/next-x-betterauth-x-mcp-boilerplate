"use client";

import { revokeUserSessionsAction } from "@/app/(AuthModule)/admin/_/actions";
import { useUserMutation, type UserMutationOptions } from "./useUserMutation";

/** Signs the target out of every device; also the recovery for its own partial outcome. */
export function useRevokeSessions(userId: string, options: UserMutationOptions) {
  const { run, pending } = useUserMutation("revokeSessions", revokeUserSessionsAction, options);
  return { run: () => run({ userId }), pending };
}
