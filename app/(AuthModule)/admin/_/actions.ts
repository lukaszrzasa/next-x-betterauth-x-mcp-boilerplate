"use server";

import { toServerAction } from "@/src/lib/auth/builders/adapters";
import { banUserOperation } from "./operations/users/ban";
import { retryEmailChangeEffectsOperation } from "./operations/users/retryEmailChangeEffects";
import {
  retryBanSessionsOperation,
  retryNameSessionRefreshOperation,
  retryUnbanSessionRefreshOperation,
} from "./operations/users/retrySessionEffects";
import { revokeUserSessionsOperation } from "./operations/users/revokeSessions";
import { sendPasswordResetOperation } from "./operations/users/sendPasswordReset";
import { sendVerificationOperation } from "./operations/users/sendVerification";
import { unbanUserOperation } from "./operations/users/unban";
import { updateUserEmailOperation } from "./operations/users/updateEmail";
import { updateUserNameOperation } from "./operations/users/updateName";

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
