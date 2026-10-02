import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDom } from "../helpers/dom";

installDom("http://localhost:3000/settings/account");

/**
 * The Account page's sections with the Server Actions mocked: each section
 * owns its feedback, forms carry only their own fields, the password
 * checkbox defaults on, confirmations precede the consequential actions,
 * and the setup/recovery-code material is gone from the DOM once the flow
 * closes.
 */

const refresh = mock();
const replace = mock();
let pathname = "/settings/account";
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace, refresh }),
  usePathname: () => pathname,
  unstable_rethrow: () => {},
}));
const sendStepUpEmail = mock(async () => ({ ok: true, data: undefined }));
mock.module("../../src/lib/auth/stepUpActions", () => ({ sendStepUpEmail }));

const ok = (data) => ({ ok: true, data });
const completed = () => ok({ status: "completed" });
const pendingRequest = (state, extra = {}) =>
  ok({
    status: "pending",
    delivery: "sent",
    request: { state, id: "req-1", kind: "change", originalEmail: "ada@example.com", expiresAt: "2026-09-27T12:00:00.000Z", resendAfter: null, ...extra },
  });
const actions = {
  updateDisplayNameAction: mock(async () => completed()),
  retryProfileSessionRefreshAction: mock(async () => completed()),
  resendVerificationAction: mock(async () => completed()),
  beginEmailChangeAction: mock(async () => pendingRequest("awaiting_current")),
  beginEmailCorrectionAction: mock(async () => pendingRequest("awaiting_new", { kind: "correction", newEmail: "right@example.com" })),
  selectNewEmailAction: mock(async () => pendingRequest("awaiting_new", { newEmail: "new@example.com" })),
  resendEmailRequestAction: mock(async () => pendingRequest("awaiting_current")),
  cancelEmailRequestAction: mock(async () => completed()),
  confirmEmailProofAction: mock(async () => ok({ status: "current-confirmed" })),
  changePasswordAction: mock(async () => completed()),
  beginEnrollmentAction: mock(async () =>
    ok({ status: "pending", requestId: "setup-1", kind: "enroll", expiresAt: "2026-09-26T12:10:00.000Z", totpUri: "otpauth://totp/Boilerplate:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Boilerplate", manualKey: "JBSWY3DPEHPK3PXP" }),
  ),
  confirmEnrollmentAction: mock(async () => ok({ status: "completed", recoveryCodes: ["aaaaa-11111", "bbbbb-22222"], issuedAt: "2026-09-26T12:00:00.000Z", failedEffects: [] })),
  beginReplacementAction: mock(async () => ok({ status: "pending", requestId: "setup-2", kind: "replace", expiresAt: "2026-09-26T12:10:00.000Z", totpUri: "otpauth://totp/x?secret=ABCDEFGH", manualKey: "ABCDEFGH" })),
  confirmReplacementAction: mock(async () => ok({ status: "completed", recoveryCodes: ["ccccc-33333"], issuedAt: "2026-09-26T12:00:00.000Z", failedEffects: [] })),
  cancelSetupAction: mock(async () => completed()),
  disableAuthenticatorAction: mock(async () => completed()),
  retryFactorSessionRefreshAction: mock(async () => completed()),
  regenerateRecoveryCodesAction: mock(async () => ok({ status: "completed", recoveryCodes: ["ddddd-44444", "eeeee-55555"], issuedAt: "2026-09-26T12:00:00.000Z", failedEffects: [] })),
  revokeSessionAction: mock(async () => completed()),
  revokeOtherSessionsAction: mock(async () => completed()),
  revokeAllSessionsAction: mock(async () => ok({ status: "completed", selfSignedOut: true })),
};
mock.module("../../app/(AuthModule)/_/actions.ts", () => actions);

const React = await import("react");
const { render: baseRender, fireEvent, screen, cleanup, waitFor, within, act } = await import("@testing-library/react");
const { withIntl } = await import("../helpers/intl.jsx");
/** Every section reads the English catalog through the provider, as in the app. */
const render = (ui, options) => baseRender(ui, { wrapper: withIntl(), ...options });
const { ActionProvider } = await import("../../src/lib/actions");
const { TooltipProvider } = await import("../../src/components/ui/tooltip");
const { ConfirmDialogRoot } = await import("../../src/components/feedback/ConfirmDialog");
const { AccountSettings } = await import("../../app/(AuthModule)/_/components/settings/account/AccountSettings");
const { SettingsNavigation } = await import("../../app/(AuthModule)/_/components/settings/SettingsNavigation");
const { ProfileSection } = await import("../../app/(AuthModule)/_/components/settings/profile/ProfileSection");

const accountOf = (overrides = {}) => ({
  email: "ada@example.com",
  emailVerified: true,
  twoFactorEnabled: false,
  twoFactorRequired: false,
  pendingEmail: { state: "none" },
  ...overrides,
});
const sessionsOf = (items = []) => ({ items, page: 1, pageSize: 20, total: items.length });
const current = { id: "s-current", isCurrent: true, createdAt: "2026-09-20T10:00:00.000Z", expiresAt: "2026-09-27T10:00:00.000Z", ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120" };
const other = { id: "s-other", isCurrent: false, createdAt: "2026-09-21T10:00:00.000Z", expiresAt: "2026-09-28T10:00:00.000Z", ipAddress: null, userAgent: "Mozilla/5.0 (iPhone) Safari/17" };

function renderAccount(account = accountOf(), sessions = sessionsOf([current, other])) {
  return render(
    <TooltipProvider>
      <ActionProvider>
        <AccountSettings account={account} sessions={sessions} />
        <ConfirmDialogRoot />
      </ActionProvider>
    </TooltipProvider>,
  );
}

/** Radix unmounts a closed dialog asynchronously. */
const closed = () =>
  waitFor(() => {
    if (document.querySelector('[role="dialog"]')) throw new Error("dialog still open");
  });

async function confirmDialog(name) {
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name }));
  // Radix closes the dialog asynchronously; until then the page is aria-hidden.
  await waitFor(() => {
    if (document.querySelector('[role="alertdialog"]')) throw new Error("dialog still open");
  });
}

beforeEach(() => {
  pathname = "/settings/account";
  for (const fn of [refresh, replace, sendStepUpEmail, ...Object.values(actions)]) fn.mockClear();
});
afterEach(cleanup);

test("navigation: real links, the current page marked, stacked layout classes present", () => {
  render(<SettingsNavigation />);
  expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
  const nav = screen.getByRole("navigation", { name: "Settings" });
  const links = within(nav).getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual(["/settings/profile", "/settings/account"]);
  expect(links[1].getAttribute("aria-current")).toBe("page");
  expect(links[0].getAttribute("aria-current")).toBeNull();
  expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toContain("Account");
});

test("sections render in reading order with real h2 headings; recovery codes exist only for an enrolled account; the current session is labelled and not individually revocable", () => {
  const view = renderAccount(accountOf({ twoFactorEnabled: true }));
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
    "Email address",
    "Password",
    "Authenticator",
    "Recovery codes",
    "Sessions",
  ]);
  view.unmount();
  renderAccount();
  const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
  expect(headings).toEqual(["Email address", "Password", "Authenticator", "Sessions"]);
  expect(screen.getByText("This device")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  expect(screen.getByText("Chrome on Mac")).toBeTruthy();
  expect(screen.getByText("Safari on iPhone")).toBeTruthy();
  expect(screen.getByText(/IP unknown/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Change email" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Set up authenticator" })).toBeTruthy();
  expect(screen.queryByText(/password age|last changed/i)).toBeNull();
});

test("password: confirmation stays in the browser, the checkbox defaults on and controls the input, fields clear after success", async () => {
  renderAccount();
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  const checkbox = screen.getByRole("checkbox", { name: /Sign out other devices/ });
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-password-1" } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-12" } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "different" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Change password" }));
  });
  await screen.findByText("Passwords do not match.");
  expect(actions.changePasswordAction).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password-12" } });
  fireEvent.click(checkbox);
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Change password" }));
  });
  await waitFor(() => expect(actions.changePasswordAction).toHaveBeenCalledTimes(1));
  expect(actions.changePasswordAction.mock.calls[0][0]).toEqual({ currentPassword: "old-password-1", newPassword: "new-password-12", revokeOtherSessions: false });
  await screen.findByText("Password changed");
  await closed();
  expect(screen.queryByLabelText("Current password")).toBeNull();
  expect(refresh).toHaveBeenCalled();
});

test("password: a wrong current password lands on its field; an unverified address hides the form with an explanation", async () => {
  actions.changePasswordAction.mockImplementationOnce(async () => ({ ok: false, reason: "INVALID_INPUT", status: 400, message: "That password is not correct.", data: { field: "currentPassword", code: "INCORRECT_PASSWORD" } }));
  const view = renderAccount();
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "wrong-password" } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-12" } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password-12" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Change password" }));
  });
  await screen.findByText("That password is not correct.");
  expect(screen.getByLabelText("Current password").getAttribute("aria-invalid")).toBe("true");
  view.unmount();
  renderAccount(accountOf({ emailVerified: false }));
  expect(screen.queryByRole("button", { name: "Change password" })).toBeNull();
  expect(screen.getByText(/Verify your email address to change the password/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Verify email" })).toBeTruthy();
  expect(screen.getByText(/Entered the wrong email when signing up\?/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Correct it" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Change email" })).toBeNull();
});

test("email change: read-only current address, password only, consequence dialog, then the pending status", async () => {
  const view = renderAccount();
  fireEvent.click(screen.getByRole("button", { name: "Change email" }));
  expect(screen.getByLabelText("Current email address").readOnly).toBe(true);
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "my-password-1" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Change email address" }));
  });
  await confirmDialog("Keep current address");
  expect(actions.beginEmailChangeAction).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Change email address" }));
  });
  await confirmDialog("Send confirmation");
  await waitFor(() => expect(actions.beginEmailChangeAction).toHaveBeenCalledTimes(1));
  expect(actions.beginEmailChangeAction.mock.calls[0][0]).toEqual({ currentPassword: "my-password-1" });
  await screen.findByText(/Confirmation link sent to your current address/);
  await closed();
  expect(refresh).toHaveBeenCalled();
  view.unmount();

  renderAccount(accountOf({ pendingEmail: { state: "awaiting_new_address", id: "req-1", kind: "change", originalEmail: "ada@example.com", expiresAt: "2026-09-27T12:00:00.000Z" } }));
  expect(screen.getByText("Current address confirmed")).toBeTruthy();
  expect(screen.getByText("Sep 27, 2026, 12:00 PM UTC")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Enter new address" }));
  fireEvent.change(screen.getByLabelText("New email address"), { target: { value: "New@Example.com" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Enter new email address" }));
  });
  await waitFor(() => expect(actions.selectNewEmailAction).toHaveBeenCalledWith({ requestId: "req-1", newEmail: "new@example.com" }));
  await closed();
  fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
  await confirmDialog("Cancel request");
  await waitFor(() => expect(actions.cancelEmailRequestAction).toHaveBeenCalledWith({ requestId: "req-1" }));
});

test("email correction: the authenticator field appears only for an enrolled account; the form submits exactly its fields", async () => {
  const view = renderAccount(accountOf({ emailVerified: false }));
  fireEvent.click(screen.getByRole("button", { name: "Correct it" }));
  expect(screen.queryByLabelText("Authenticator code")).toBeNull();
  fireEvent.change(screen.getByLabelText("Corrected email address"), { target: { value: "right@example.com" } });
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "my-password-1" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Correct email address" }));
  });
  await waitFor(() => expect(actions.beginEmailCorrectionAction).toHaveBeenCalledWith({ newEmail: "right@example.com", currentPassword: "my-password-1", authenticatorCode: "" }));
  view.unmount();
  renderAccount(accountOf({ emailVerified: false, twoFactorEnabled: true }));
  fireEvent.click(screen.getByRole("button", { name: "Correct it" }));
  expect(screen.getByLabelText("Authenticator code")).toBeTruthy();
});

test("authenticator setup: QR and manual key appear after the password step, codes are shown once and gone after Done", async () => {
  renderAccount();
  fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "my-password-1" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Set up authenticator" }));
  });
  await waitFor(() => expect(actions.beginEnrollmentAction).toHaveBeenCalledWith({ currentPassword: "my-password-1" }));
  await screen.findByText("JBSWY3DPEHPK3PXP");
  expect(document.querySelector("svg[role='img'], svg")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Code from the new authenticator"), { target: { value: "123456" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Confirm new authenticator" }));
  });
  await waitFor(() => expect(actions.confirmEnrollmentAction).toHaveBeenCalledWith({ requestId: "setup-1", code: "123456" }));
  await screen.findByText("aaaaa-11111");
  expect(screen.queryByText("JBSWY3DPEHPK3PXP")).toBeNull();
  expect(refresh).toHaveBeenCalled();
  const done = screen.getByRole("button", { name: "Done" });
  expect(done.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /I have saved these codes/ }));
  expect(done.disabled).toBe(false);
  fireEvent.click(done);
  await screen.findByText("Authenticator activated");
  await closed();
  expect(screen.queryByText("aaaaa-11111")).toBeNull();
  expect(screen.queryByText("bbbbb-22222")).toBeNull();
  expect(document.body.textContent).not.toContain("aaaaa-11111");
});

test("authenticator: cancelling the code step abandons the attempt; an enrolled account offers replace and, when not required, disable", async () => {
  const view = renderAccount(accountOf({ twoFactorEnabled: true }));
  expect(screen.getByRole("button", { name: "Replace authenticator" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Disable" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Generate new codes" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Replace authenticator" }));
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "my-password-1" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Replace authenticator" }));
  });
  await screen.findByText("ABCDEFGH");
  fireEvent.click(screen.getByRole("button", { name: "Cancel setup" }));
  await waitFor(() => expect(actions.cancelSetupAction).toHaveBeenCalledWith({ requestId: "setup-2" }));
  await closed();
  expect(screen.queryByText("ABCDEFGH")).toBeNull();
  view.unmount();
  renderAccount(accountOf({ twoFactorEnabled: true, twoFactorRequired: true }));
  expect(screen.queryByRole("button", { name: "Disable" })).toBeNull();
  // The requirement sits beside the heading; its explanation is a tooltip, not page text.
  const heading = screen.getByRole("heading", { level: 2, name: "Authenticator" });
  expect(heading.parentElement.textContent).toContain("Required for your account");
  expect(screen.queryByText(/can be replaced but not disabled/)).toBeNull();
});

test("recovery codes: password, an explicit stop-working confirmation, one-time panel with copy and download", async () => {
  renderAccount(accountOf({ twoFactorEnabled: true }));
  fireEvent.click(screen.getByRole("button", { name: "Generate new codes" }));
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "my-password-1" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Generate new recovery codes" }));
  });
  await confirmDialog("Generate new codes");
  await waitFor(() => expect(actions.regenerateRecoveryCodesAction).toHaveBeenCalledWith({ currentPassword: "my-password-1" }));
  await screen.findByText("ddddd-44444");
  expect(screen.getByRole("button", { name: "Copy all" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Download .txt" })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /I have saved these codes/ }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await screen.findByText("New recovery codes generated");
  await closed();
  expect(document.body.textContent).not.toContain("ddddd-44444");
});

test("sessions: individual sign-out and other-device sign-out confirm first; sign out everywhere navigates to sign-in", async () => {
  renderAccount();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await confirmDialog("Sign out session");
  await waitFor(() => expect(actions.revokeSessionAction).toHaveBeenCalledWith({ sessionId: "s-other" }));
  await screen.findByText("Session signed out");
  fireEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));
  await confirmDialog("Sign out other devices");
  await waitFor(() => expect(actions.revokeOtherSessionsAction).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
  await confirmDialog("Sign out everywhere");
  await waitFor(() => expect(actions.revokeAllSessionsAction).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth/sign-in"));
});

test("a partial outcome is reported as such and offers its recovery; a transport failure asks to refresh before retrying", async () => {
  actions.revokeOtherSessionsAction.mockImplementationOnce(async () => ok({ status: "partial", committed: false, failedEffects: ["session-revocation"] }));
  renderAccount();
  fireEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));
  await confirmDialog("Sign out other devices");
  await screen.findByText(/Not confirmed: signing out could not be confirmed/);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(actions.revokeOtherSessionsAction).toHaveBeenCalledTimes(2));
  await screen.findByText("Other devices signed out");

  actions.updateDisplayNameAction.mockImplementationOnce(async () => {
    throw new Error("network");
  });
  cleanup();
  render(
    <ActionProvider>
      <ProfileSection profile={{ name: "Ada" }} />
    </ActionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada Lovelace" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Edit display name" }));
  });
  await screen.findByText(/Refresh the page to see the current state before trying again/);
  expect(actions.updateDisplayNameAction).toHaveBeenCalledTimes(1);
});
