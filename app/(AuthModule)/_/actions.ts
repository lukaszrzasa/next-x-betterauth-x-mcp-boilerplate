"use server";

import { toServerAction } from "@/src/lib/auth/builders/adapters";
import { completePasswordResetOperation } from "./operations/passwordReset";
import { setupRootAdmin } from "./operations/setup";
import {
  beginEnrollmentOperation,
  beginReplacementOperation,
  cancelSetupOperation,
  confirmEnrollmentOperation,
  confirmReplacementOperation,
  disableAuthenticatorOperation,
  retryFactorSessionRefreshOperation,
} from "./operations/settings/authenticator";
import {
  beginEmailChangeOperation,
  cancelEmailRequestOperation,
  resendEmailRequestOperation,
  resendVerificationOperation,
  selectNewEmailOperation,
} from "./operations/settings/emailChange";
import { beginEmailCorrectionOperation } from "./operations/settings/emailCorrection";
import { confirmEmailProofOperation } from "./operations/settings/emailProof";
import { changePasswordOperation } from "./operations/settings/password";
import {
  retryProfileSessionRefreshOperation,
  updateDisplayNameOperation,
} from "./operations/settings/profile";
import { regenerateRecoveryCodesOperation } from "./operations/settings/recoveryCodes";
import {
  revokeAllSessionsOperation,
  revokeOtherSessionsOperation,
  revokeSessionOperation,
} from "./operations/settings/sessions";

export const setupRootAdminAction = toServerAction(setupRootAdmin);

/** Public: the emailed reset link's completion, coordinated with the account lock. */
export const completePasswordResetAction = toServerAction(completePasswordResetOperation);

/** Account settings: the inferred adapters of the guarded operations, nothing else. */
export const updateDisplayNameAction = toServerAction(updateDisplayNameOperation);
export const retryProfileSessionRefreshAction = toServerAction(retryProfileSessionRefreshOperation);
export const resendVerificationAction = toServerAction(resendVerificationOperation);
export const beginEmailChangeAction = toServerAction(beginEmailChangeOperation);
export const beginEmailCorrectionAction = toServerAction(beginEmailCorrectionOperation);
export const selectNewEmailAction = toServerAction(selectNewEmailOperation);
export const resendEmailRequestAction = toServerAction(resendEmailRequestOperation);
export const cancelEmailRequestAction = toServerAction(cancelEmailRequestOperation);
/** Public: the explicit submit of the emailed confirmation link. */
export const confirmEmailProofAction = toServerAction(confirmEmailProofOperation);
export const changePasswordAction = toServerAction(changePasswordOperation);
export const beginEnrollmentAction = toServerAction(beginEnrollmentOperation);
export const confirmEnrollmentAction = toServerAction(confirmEnrollmentOperation);
export const beginReplacementAction = toServerAction(beginReplacementOperation);
export const confirmReplacementAction = toServerAction(confirmReplacementOperation);
export const cancelSetupAction = toServerAction(cancelSetupOperation);
export const disableAuthenticatorAction = toServerAction(disableAuthenticatorOperation);
export const retryFactorSessionRefreshAction = toServerAction(retryFactorSessionRefreshOperation);
export const regenerateRecoveryCodesAction = toServerAction(regenerateRecoveryCodesOperation);
export const revokeSessionAction = toServerAction(revokeSessionOperation);
export const revokeOtherSessionsAction = toServerAction(revokeOtherSessionsOperation);
export const revokeAllSessionsAction = toServerAction(revokeAllSessionsOperation);
