"use client";

import { sendPasswordResetAction } from "@/app/(AuthModule)/admin/_/actions";
import { useUserMutation, type UserMutationOptions } from "./useUserMutation";

/** Requests a password-reset email for the target's current address. */
export function useSendPasswordReset(userId: string, options: UserMutationOptions) {
  const { run, pending } = useUserMutation("sendPasswordReset", sendPasswordResetAction, options);
  return { run: () => run({ userId }), pending };
}
