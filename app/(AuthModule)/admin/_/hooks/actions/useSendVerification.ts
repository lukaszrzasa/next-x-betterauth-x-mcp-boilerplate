"use client";

import { sendVerificationAction } from "@/app/(AuthModule)/admin/_/actions";
import { useUserMutation, type UserMutationOptions } from "./useUserMutation";

/** Requests a verification email for the target's current address. */
export function useSendVerification(userId: string, options: UserMutationOptions) {
  const { run, pending } = useUserMutation("sendVerification", sendVerificationAction, options);
  return { run: () => run({ userId }), pending };
}
