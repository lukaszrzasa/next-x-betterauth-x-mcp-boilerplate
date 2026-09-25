"use client";

import { retryEmailChangeEffectsAction } from "@/app/(AuthModule)/admin/_/actions";
import { useUserMutation, type UserMutationOptions } from "./useUserMutation";

/** Finishes a partial email change: revokes sessions and re-requests verification. */
export function useRetryEmailChangeEffects(userId: string, options: UserMutationOptions) {
  const { run, pending } = useUserMutation("retryEmailChangeEffects", retryEmailChangeEffectsAction, options);
  return { run: () => run({ userId }), pending };
}
