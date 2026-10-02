import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDom } from "../helpers/dom";

installDom();

const refresh = mock();
const replace = mock();
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace, refresh }),
  usePathname: () => "/admin/users/u-target",
  // The action runtime re-throws framework control flow; nothing here throws it.
  unstable_rethrow: () => {},
}));
const sendStepUpEmail = mock(async () => ({ ok: true, data: undefined }));
mock.module("../../src/lib/auth/stepUpActions", () => ({ sendStepUpEmail }));

const ok = (data) => ({ ok: true, data });
const completed = (userId = "u-target") => ok({ status: "completed", userId });
const actions = {
  updateUserNameAction: mock(async () => completed()),
  updateUserEmailAction: mock(async () => completed()),
  banUserAction: mock(async () => completed()),
  unbanUserAction: mock(async () => completed()),
  revokeUserSessionsAction: mock(async () => completed()),
  sendVerificationAction: mock(async () => completed()),
  sendPasswordResetAction: mock(async () => completed()),
  retryEmailChangeEffectsAction: mock(async () => completed()),
  retryBanSessionsAction: mock(async () => completed()),
  retryNameSessionRefreshAction: mock(async () => completed()),
  retryUnbanSessionRefreshAction: mock(async () => completed()),
};
mock.module("../../app/(AuthModule)/admin/_/actions.ts", () => actions);
// The account's staff log is the logs module's widget; its own suite covers it.
const emptyStaffLog = (query) =>
  ok({ items: [], total: 0, page: 1, pageSize: query.pageSize, query, asOf: "2026-09-20T14:32:00.000Z", range: { from: null, until: null } });
const listStaffLogsAction = mock(async (query) => emptyStaffLog(query));
mock.module("../../app/(LogsModule)/admin/_/actions.ts", () => ({ listStaffLogsAction, getEmailLogAction: mock() }));

const React = await import("react");
const { render, fireEvent, screen, cleanup, waitFor, within, act } = await import("@testing-library/react");
const { ActionProvider } = await import("../../src/lib/actions");
const { ConfirmDialogRoot } = await import("../../src/components/feedback/ConfirmDialog");
const { ViewerProvider } = await import("../../src/components/shell/ViewerProvider");
const { IntlWrapper } = await import("../helpers/intl");
const { UserDetail } = await import("../../app/(AuthModule)/admin/_/components/users/detail/UserDetail");
const { USER_ACTIONS } = await import("../../app/(AuthModule)/admin/_/types");

const allow = (overrides = {}) =>
  Object.fromEntries(USER_ACTIONS.map((action) => [action, overrides[action] ?? { allowed: true }]));
const userOf = (overrides = {}) => ({
  id: "u-target",
  name: "Grace Hopper",
  email: "grace@example.com",
  image: null,
  roles: ["user"],
  emailVerified: false,
  accessStatus: "active",
  banExpires: null,
  createdAt: "2026-08-15T09:00:00.000Z",
  updatedAt: "2026-09-20T14:32:00.000Z",
  banReason: null,
  twoFactorRequired: false,
  twoFactorEnabled: false,
  isRoot: false,
  isSelf: false,
  capabilities: allow({ unban: { allowed: false, reason: "not-banned" } }),
  ...overrides,
});

function renderDetail(user, listUrl = "/admin/users", role = "admin") {
  return render(
    <IntlWrapper>
      <ViewerProvider viewer={{ name: "Viewer", email: "v@example.com", image: null, role }}>
        <ActionProvider>
          <UserDetail user={user} listUrl={listUrl} />
          <ConfirmDialogRoot />
        </ActionProvider>
      </ViewerProvider>
    </IntlWrapper>,
  );
}

const required = {
  ok: false,
  reason: "TWO_FACTOR_REQUIRED",
  status: 428,
  message: "Verify",
  data: { policy: "five_minutes", methods: ["totp"] },
};

beforeEach(() => {
  for (const fn of [refresh, replace, sendStepUpEmail, ...Object.values(actions)]) fn.mockClear();
  for (const fn of Object.values(actions)) fn.mockImplementation(async () => completed());
});
afterEach(cleanup);

test("the header and sections present the account; controls follow capabilities, not the viewer's role", () => {
  renderDetail(userOf());
  expect(screen.getByRole("heading", { level: 1, name: "Grace Hopper" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to users" }).getAttribute("href")).toBe("/admin/users");
  const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
  expect(headings).toEqual(["Profile", "Security", "Access", "Account details", "Staff log"]);
  for (const name of ["Edit name", "Edit email", "Send verification email", "Send password-reset email", "Sign out of all devices", "Ban user"])
    expect(screen.getByRole("button", { name })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Remove ban" })).toBeNull();
  expect(screen.queryByText(/Delete/)).toBeNull();
  expect(screen.getByText("Sep 20, 2026 at 02:32 PM UTC").getAttribute("datetime")).toBe("2026-09-20T14:32:00.000Z");
  expect(screen.getByRole("button", { name: "Copy user ID" })).toBeTruthy();
});

test("missing permissions hide controls; root and self policy show explanations instead", () => {
  const view = renderDetail(
    userOf({
      capabilities: allow({
        updateEmail: { allowed: false, reason: "permission" },
        sendPasswordReset: { allowed: false, reason: "permission" },
        revokeSessions: { allowed: false, reason: "permission" },
        unban: { allowed: false, reason: "not-banned" },
      }),
    }),
  );
  expect(screen.queryByRole("button", { name: "Edit email" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Send password-reset email" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out of all devices" })).toBeNull();
  expect(screen.queryByText(/permission/)).toBeNull();
  view.unmount();

  renderDetail(
    userOf({
      isRoot: true,
      roles: ["admin"],
      capabilities: allow({
        updateName: { allowed: false, reason: "root-protected" },
        updateEmail: { allowed: false, reason: "root-protected" },
        sendVerification: { allowed: false, reason: "root-protected" },
        sendPasswordReset: { allowed: false, reason: "root-protected" },
        revokeSessions: { allowed: false, reason: "root-protected" },
        ban: { allowed: false, reason: "root-protected" },
        unban: { allowed: false, reason: "root-protected" },
      }),
    }),
  );
  expect(screen.getByText("Root account")).toBeTruthy();
  expect(screen.getByText(/Only the root account itself can change it/)).toBeTruthy();
  expect(screen.getAllByText("Only the root account can change this.").length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Ban user" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit name" })).toBeNull();
  expect(screen.queryByRole("link", { name: /settings/i })).toBeNull();
});

test("a verified account offers no verification resend; a banned one offers update and removal", () => {
  renderDetail(
    userOf({
      emailVerified: true,
      accessStatus: "permanently-banned",
      banReason: "Spam\nacross two lines",
      capabilities: allow({ sendVerification: { allowed: false, reason: "already-verified" } }),
    }),
  );
  expect(screen.queryByRole("button", { name: "Send verification email" })).toBeNull();
  expect(screen.getByRole("button", { name: "Update ban" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove ban" })).toBeTruthy();
  expect(screen.getByText("Never (permanent)")).toBeTruthy();
  expect(screen.getByText(/Spam/).textContent).toContain("across two lines");
});

test("name editing: one field, disabled while unchanged, submitted alone, cancel restores", async () => {
  renderDetail(userOf());
  fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
  const input = screen.getByLabelText("Name");
  expect(input.value).toBe("Grace Hopper");
  expect(screen.getByRole("button", { name: "Save name" }).disabled).toBe(true);
  // The form is a modal: the page behind it, including the other edit button, is hidden.
  expect(screen.getByRole("dialog", { name: "Edit name" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit email" })).toBeNull();
  fireEvent.change(input, { target: { value: "Grace B. Hopper" } });
  expect(screen.getByRole("button", { name: "Save name" }).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    if (screen.queryByLabelText("Name")) throw new Error("still open");
  });
  expect(actions.updateUserNameAction).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Grace B. Hopper" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Edit name" }));
  });
  await waitFor(() => expect(actions.updateUserNameAction).toHaveBeenCalledTimes(1));
  expect(actions.updateUserNameAction.mock.calls[0][0]).toEqual({ userId: "u-target", name: "Grace B. Hopper" });
  await screen.findByText("Name updated");
  await waitFor(() => {
    if (screen.queryByLabelText("Name")) throw new Error("still open");
  });
  expect(refresh).toHaveBeenCalled();
});

test("a field refusal stays on the field with the typed value; a partial outcome offers its recovery", async () => {
  actions.updateUserNameAction.mockImplementationOnce(async () => ({
    ok: false,
    reason: "INVALID_INPUT",
    status: 400,
    message: "Names cannot contain control characters.",
    data: { field: "name", code: "custom" },
  }));
  renderDetail(userOf());
  fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Name" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Edit name" }));
  });
  await screen.findByText("Names cannot contain control characters.");
  expect(screen.getByLabelText("Name").value).toBe("Bad Name");
  expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");

  actions.updateUserNameAction.mockImplementationOnce(async () =>
    ok({
      status: "partial",
      userId: "u-target",
      committed: true,
      effectsMayHaveApplied: true,
      failedEffects: [{ effect: "session-refresh", code: "UNAVAILABLE" }],
    }),
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Good Name" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Edit name" }));
  });
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Name updated, but the user's active sessions could not be updated.");
  expect(alert.getAttribute("data-tone")).toBe("warning");
  await act(async () => {
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
  });
  await waitFor(() => expect(actions.retryNameSessionRefreshAction).toHaveBeenCalledWith({ userId: "u-target" }));
  expect(actions.updateUserNameAction).toHaveBeenCalledTimes(2);
});

test("email change asks for confirmation, then retries the same payload with the step-up proof", async () => {
  actions.updateUserEmailAction.mockImplementation(async (input, meta) =>
    meta?.stepUp ? completed() : required,
  );
  renderDetail(userOf());
  fireEvent.click(screen.getByRole("button", { name: "Edit email" }));
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@example.com" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "Edit email address" }));
  });
  const confirmation = await screen.findByRole("alertdialog");
  expect(confirmation.textContent).toContain("new@example.com");
  expect(confirmation.textContent).toContain("signed out");
  expect(actions.updateUserEmailAction).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(within(confirmation).getByRole("button", { name: "Change email" }));
  });
  const modal = await screen.findByRole("dialog");
  expect(within(modal).getByText("Verify your identity")).toBeTruthy();
  expect(actions.updateUserEmailAction).toHaveBeenCalledTimes(1);
  await act(async () => {
    fireEvent.change(within(modal).getByLabelText("Six-digit code"), { target: { value: "123456" } });
    fireEvent.submit(modal.querySelector("form"));
  });
  await waitFor(() => expect(actions.updateUserEmailAction).toHaveBeenCalledTimes(2));
  expect(actions.updateUserEmailAction.mock.calls[1][0]).toEqual({ userId: "u-target", email: "new@example.com" });
  expect(actions.updateUserEmailAction.mock.calls[1][1]).toEqual({ stepUp: { method: "totp", code: "123456" } });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await screen.findByText(/Email updated/);
});

test("ban needs an explicit duration and reason; the wording distinguishes permanent, temporary and replacement", async () => {
  renderDetail(userOf());
  fireEvent.click(screen.getByRole("button", { name: "Ban user" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "Ban user" })).toBeTruthy();
  expect(within(dialog).getByLabelText("Duration").value).toBe("");
  await act(async () => {
    fireEvent.submit(dialog.querySelector("form"));
  });
  await within(dialog).findByText("Choose how long the ban lasts.");
  await within(dialog).findByText("Give a reason of at least 3 characters.");
  expect(actions.banUserAction).not.toHaveBeenCalled();

  fireEvent.change(within(dialog).getByLabelText("Duration"), { target: { value: "permanent" } });
  expect(dialog.textContent).toContain("cannot sign in until an administrator removes the ban");
  fireEvent.change(within(dialog).getByLabelText("Duration"), { target: { value: "7d" } });
  expect(dialog.textContent).toContain("cannot sign in for 7 days from now");
  fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Repeated spam" } });
  await act(async () => {
    fireEvent.submit(dialog.querySelector("form"));
  });
  await waitFor(() => expect(actions.banUserAction).toHaveBeenCalledTimes(1));
  expect(actions.banUserAction.mock.calls[0][0]).toEqual({ userId: "u-target", duration: "7d", reason: "Repeated spam" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await screen.findByText(/Ban saved/);
});

test("replacing a ban says the new period starts now; a partial ban offers to finish sign-out without a new ban", async () => {
  actions.banUserAction.mockImplementationOnce(async () =>
    ok({
      status: "partial",
      userId: "u-target",
      committed: true,
      effectsMayHaveApplied: true,
      failedEffects: [{ effect: "session-revocation", code: "UNAVAILABLE" }],
    }),
  );
  renderDetail(userOf({ accessStatus: "temporarily-banned", banExpires: "2026-10-01T12:30:00.000Z", banReason: "old" }));
  fireEvent.click(screen.getByRole("button", { name: "Update ban" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("banned until Oct 1, 2026 at 12:30 PM UTC");
  expect(dialog.textContent).toContain("period starts now");
  fireEvent.change(within(dialog).getByLabelText("Duration"), { target: { value: "24h" } });
  fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Escalated" } });
  await act(async () => {
    fireEvent.submit(dialog.querySelector("form"));
  });
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Ban saved, but sessions could not be fully revoked.");
  expect(alert.textContent).toContain("Retry to finish signing the user out.");
  await act(async () => {
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
  });
  await waitFor(() => expect(actions.retryBanSessionsAction).toHaveBeenCalledWith({ userId: "u-target" }));
  expect(actions.banUserAction).toHaveBeenCalledTimes(1);
});

test("sign-out and unban confirm first; emails send directly; rate limits count down instead of resending", async () => {
  actions.sendVerificationAction.mockImplementationOnce(async () => ({
    ok: false,
    reason: "RATE_LIMITED",
    status: 429,
    message: "Please wait 42 seconds before sending another email to this user.",
    data: { retryAfterSeconds: 42 },
  }));
  renderDetail(userOf({ accessStatus: "permanently-banned", capabilities: allow() }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send verification email" }));
  });
  const limited = await screen.findByRole("alert");
  expect(limited.textContent).toContain("You can send again in 42s.");
  expect(actions.sendVerificationAction).toHaveBeenCalledTimes(1);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send password-reset email" }));
  });
  await screen.findByText("Password-reset email requested");
  expect(actions.sendPasswordResetAction).toHaveBeenCalledWith({ userId: "u-target" });

  fireEvent.click(screen.getByRole("button", { name: "Sign out of all devices" }));
  const signOut = await screen.findByRole("alertdialog");
  expect(signOut.textContent).toContain("Sign this user out of all devices?");
  expect(actions.revokeUserSessionsAction).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(within(signOut).getByRole("button", { name: "Sign out everywhere" }));
  });
  await waitFor(() => expect(actions.revokeUserSessionsAction).toHaveBeenCalledWith({ userId: "u-target" }));
  await screen.findByText("Signed out of all devices");

  fireEvent.click(screen.getByRole("button", { name: "Remove ban" }));
  const unban = await screen.findByRole("alertdialog");
  await act(async () => {
    fireEvent.click(within(unban).getByRole("button", { name: "Keep ban" }));
  });
  expect(actions.unbanUserAction).not.toHaveBeenCalled();
  // The cancelled dialog unmounts on the next tick; while it is open the
  // section's own button is hidden from the accessibility tree.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove ban" }));
  await act(async () => {
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove ban" }));
  });
  await waitFor(() => expect(actions.unbanUserAction).toHaveBeenCalledWith({ userId: "u-target" }));
});

test("root signing themselves out is routed to sign-in; a vanished target asks for a refresh", async () => {
  actions.revokeUserSessionsAction.mockImplementationOnce(async () => ok({ status: "completed", userId: "u-target", selfSignedOut: true }));
  renderDetail(userOf({ isRoot: true, isSelf: true, roles: ["admin"], capabilities: allow({ ban: { allowed: false, reason: "root-self-limit" }, unban: { allowed: false, reason: "root-self-limit" }, updateEmail: { allowed: false, reason: "root-self-limit" } }) }));
  expect(screen.getByText(/it is yours/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sign out of all devices" }));
  await act(async () => {
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sign out everywhere" }));
  });
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth/sign-in"));
  expect(refresh).toHaveBeenCalled();

  actions.sendPasswordResetAction.mockImplementationOnce(async () => ({ ok: false, reason: "NOT_FOUND", status: 404, message: "gone" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send password-reset email" }));
  });
  await screen.findByText("This user no longer exists");
});

test("the account's staff log is read for an admin, by the account's ID alone", async () => {
  listStaffLogsAction.mockClear();
  renderDetail(userOf());
  expect(screen.getByRole("heading", { name: "Staff log" })).toBeTruthy();
  await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalled());
  expect(listStaffLogsAction.mock.calls[0][0]).toMatchObject({
    resourceId: "u-target",
    resourceType: "",
    actorId: "",
    actions: [],
  });
  expect(await screen.findByText("No staff actions have been logged here.")).toBeTruthy();
});

test("the staff log is read again after a confirmed change, and never because the page was rendered again", async () => {
  listStaffLogsAction.mockClear();
  const view = renderDetail(userOf());
  await screen.findByText("No staff actions have been logged here.");
  expect(listStaffLogsAction).toHaveBeenCalledTimes(1);

  // The server renders the page again after any Server Action that touched a
  // cookie, the log's own read included. That is not news about the log.
  for (const name of ["Grace Hopper", "Grace B. Hopper"]) {
    view.rerender(
      <IntlWrapper>
        <ViewerProvider viewer={{ name: "Viewer", email: "v@example.com", image: null, role: "admin" }}>
          <ActionProvider>
            <UserDetail user={userOf({ name })} listUrl="/admin/users" />
            <ConfirmDialogRoot />
          </ActionProvider>
        </ViewerProvider>
      </IntlWrapper>,
    );
    await act(async () => {});
  }
  expect(listStaffLogsAction).toHaveBeenCalledTimes(1);

  // An action that changed nothing is not news either.
  actions.sendPasswordResetAction.mockImplementationOnce(async () => ok({ status: "unchanged", userId: "u-target" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send password-reset email" }));
  });
  await waitFor(() => expect(actions.sendPasswordResetAction).toHaveBeenCalledTimes(1));
  expect(listStaffLogsAction).toHaveBeenCalledTimes(1);

  // A confirmed one is: once.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send password-reset email" }));
  });
  await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(2));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => {});
  expect(listStaffLogsAction).toHaveBeenCalledTimes(2);
});

test("a moderator sees no staff log section and nothing is read for them", async () => {
  listStaffLogsAction.mockClear();
  renderDetail(userOf(), "/admin/users", "moderator");
  expect(screen.queryByRole("heading", { name: "Staff log" })).toBeNull();
  expect(listStaffLogsAction).not.toHaveBeenCalled();
});

test("an action that was not written to the staff log says so, as a warning", async () => {
  actions.revokeUserSessionsAction.mockImplementationOnce(async () =>
    ok({ status: "completed", userId: "u-target", unrecorded: true }),
  );
  renderDetail(userOf());
  fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Sign out everywhere" }));
  expect(await screen.findByText(/was not written to the staff log/)).toBeTruthy();
});
