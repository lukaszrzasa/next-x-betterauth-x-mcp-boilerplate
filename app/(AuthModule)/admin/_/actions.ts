"use server";

import { toServerAction } from "@/src/lib/auth/builders/adapters";
import {
  banUserOperation,
  retryBanSessionsOperation,
  retryEmailChangeEffectsOperation,
  retryNameSessionRefreshOperation,
  retryUnbanSessionRefreshOperation,
  revokeUserSessionsOperation,
  unbanUserOperation,
  updateUserEmailOperation,
  updateUserNameOperation,
} from "./operations/usersMutations";
import { sendPasswordResetOperation, sendVerificationOperation } from "./operations/usersEmails";

/** Server Action exports for user administration: the inferred adapters, nothing else. */
export const updateUserNameAction = toServerAction(updateUserNameOperation);
export const updateUserEmailAction = toServerAction(updateUserEmailOperation);
export const revokeUserSessionsAction = toServerAction(revokeUserSessionsOperation);
export const banUserAction = toServerAction(banUserOperation);
export const unbanUserAction = toServerAction(unbanUserOperation);
export const sendVerificationAction = toServerAction(sendVerificationOperation);
export const sendPasswordResetAction = toServerAction(sendPasswordResetOperation);
export const retryEmailChangeEffectsAction = toServerAction(retryEmailChangeEffectsOperation);
export const retryBanSessionsAction = toServerAction(retryBanSessionsOperation);
export const retryNameSessionRefreshAction = toServerAction(retryNameSessionRefreshOperation);
export const retryUnbanSessionRefreshAction = toServerAction(retryUnbanSessionRefreshOperation);
