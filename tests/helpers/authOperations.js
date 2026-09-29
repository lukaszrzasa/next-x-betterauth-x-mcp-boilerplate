/**
 * The AuthModule operations, one use case per file, gathered into the
 * groups the suites address them by. Loaded on call, so a suite's
 * `mock.module` registrations are in place before anything is imported.
 */

const SETTINGS = "../../app/(AuthModule)/_/operations/settings";
const ADMIN_USERS = "../../app/(AuthModule)/admin/_/operations/users";

async function gather(directory, files) {
  const modules = await Promise.all(files.map((file) => import(`${directory}/${file}.ts`)));
  return Object.assign({}, ...modules);
}

export async function loadSettingsOperations() {
  return {
    profile: await gather(`${SETTINGS}/profile`, ["getProfile", "updateDisplayName", "retryProfileSessionRefresh"]),
    account: await gather(SETTINGS, ["account"]),
    password: await gather(`${SETTINGS}/password`, ["changePassword"]),
    emailChange: await gather(`${SETTINGS}/emailChange`, [
      "beginEmailChange",
      "selectNewEmail",
      "resendEmailRequest",
      "cancelEmailRequest",
      "resendVerification",
    ]),
    emailCorrection: await gather(`${SETTINGS}/emailChange`, ["beginEmailCorrection"]),
    emailProof: await gather(`${SETTINGS}/emailChange`, ["inspectEmailProof", "confirmEmailProof"]),
    authenticator: await gather(`${SETTINGS}/authenticator`, [
      "beginEnrollment",
      "confirmEnrollment",
      "beginReplacement",
      "confirmReplacement",
      "cancelSetup",
      "disableAuthenticator",
      "retryFactorSessionRefresh",
    ]),
    recoveryCodes: await gather(`${SETTINGS}/authenticator`, ["regenerateRecoveryCodes"]),
    sessions: await gather(`${SETTINGS}/sessions`, [
      "listSessions",
      "revokeSession",
      "revokeOtherSessions",
      "revokeAllSessions",
    ]),
  };
}

export async function loadAdminUserOperations() {
  return {
    queries: await gather(ADMIN_USERS, ["list", "get"]),
    mutations: await gather(ADMIN_USERS, [
      "updateName",
      "updateEmail",
      "revokeSessions",
      "ban",
      "unban",
      "retryEmailChangeEffects",
      "retrySessionEffects",
    ]),
    emails: await gather(ADMIN_USERS, ["sendVerification", "sendPasswordReset"]),
  };
}
