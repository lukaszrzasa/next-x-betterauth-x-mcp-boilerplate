"use server";

import { toServerAction } from "@/src/lib/auth/builders/adapters";
import { completePasswordResetOperation } from "./operations/passwordReset";
import { setupRootAdmin } from "./operations/setup";
import { beginEnrollmentOperation } from "./operations/settings/authenticator/beginEnrollment";
import { beginReplacementOperation } from "./operations/settings/authenticator/beginReplacement";
import { cancelSetupOperation } from "./operations/settings/authenticator/cancelSetup";
import { confirmEnrollmentOperation } from "./operations/settings/authenticator/confirmEnrollment";
import { confirmReplacementOperation } from "./operations/settings/authenticator/confirmReplacement";
import { disableAuthenticatorOperation } from "./operations/settings/authenticator/disableAuthenticator";
import { regenerateRecoveryCodesOperation } from "./operations/settings/authenticator/regenerateRecoveryCodes";
import { retryFactorSessionRefreshOperation } from "./operations/settings/authenticator/retryFactorSessionRefresh";
import { beginEmailChangeOperation } from "./operations/settings/emailChange/beginEmailChange";
import { beginEmailCorrectionOperation } from "./operations/settings/emailChange/beginEmailCorrection";
import { cancelEmailRequestOperation } from "./operations/settings/emailChange/cancelEmailRequest";
import { confirmEmailProofOperation } from "./operations/settings/emailChange/confirmEmailProof";
import { resendEmailRequestOperation } from "./operations/settings/emailChange/resendEmailRequest";
import { resendVerificationOperation } from "./operations/settings/emailChange/resendVerification";
import { selectNewEmailOperation } from "./operations/settings/emailChange/selectNewEmail";
import { changePasswordOperation } from "./operations/settings/password/changePassword";
import { retryProfileSessionRefreshOperation } from "./operations/settings/profile/retryProfileSessionRefresh";
import { updateDisplayNameOperation } from "./operations/settings/profile/updateDisplayName";
import { revokeAllSessionsOperation } from "./operations/settings/sessions/revokeAllSessions";
import { revokeOtherSessionsOperation } from "./operations/settings/sessions/revokeOtherSessions";
import { revokeSessionOperation } from "./operations/settings/sessions/revokeSession";

export const setupRootAdminAction = toServerAction(setupRootAdmin);

/** Public: the emailed reset link's completion. */
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
