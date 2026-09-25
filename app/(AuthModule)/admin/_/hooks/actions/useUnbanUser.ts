"use client";

import { unbanUserAction } from "@/app/(AuthModule)/admin/_/actions";
import { useUserMutation, type UserMutationOptions } from "./useUserMutation";

/** Lifts the target's ban. */
export function useUnbanUser(userId: string, options: UserMutationOptions) {
  const { run, pending } = useUserMutation("unban", unbanUserAction, options);
  return { run: () => run({ userId }), pending };
}
