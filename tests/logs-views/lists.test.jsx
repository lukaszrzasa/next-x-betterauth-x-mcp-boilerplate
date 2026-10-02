import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { installDom } from "../helpers/dom";

/**
 * The two log lists in a DOM: table rendering and URL intents, the email
 * dialog's `?log=` selection through the History API (open, close, direct
 * link, Back/Forward, fast switching with slow responses), dialog failure
 * states, escaping of stored content, copying and the absence of write
 * controls; the staff log's message blocks, its list and the embedded
 * widget, whose state never reaches the URL. The Server Actions are mocked
 * at their module boundary; the action runtime and hooks are real.
 */

const browser = installDom("http://localhost:3000/admin/email-logs");
const PopStateEvent = browser.PopStateEvent;

// History entries created by the component, and a store `useSearchParams` reads.
const historyCalls = [];
const listeners = new Set();
const notify = () => {
  for (const listener of listeners) listener();
};
const nativePush = window.history.pushState.bind(window.history);
const nativeReplace = window.history.replaceState.bind(window.history);
window.history.pushState = (state, unused, url) => {
  historyCalls.push(["push", url]);
  nativePush(state, unused, url);
  notify();
};
window.history.replaceState = (state, unused, url) => {
  historyCalls.push(["replace", url]);
  nativeReplace(state, unused, url);
  notify();
};
window.addEventListener("popstate", notify);
/** Moves the address bar without the component's involvement, like Back/Forward. */
function travel(url) {
  nativeReplace(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

let React;
const push = mock();
const replace = mock();
mock.module("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: () => {} }),
  usePathname: () => window.location.pathname,
  unstable_rethrow: () => {},
  useSearchParams: () => {
    const search = React.useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => window.location.search,
    );
    return React.useMemo(() => new URLSearchParams(search), [search]);
  },
}));
mock.module("../../src/lib/auth/stepUpActions", () => ({ sendStepUpEmail: async () => ({ ok: true }) }));

const getEmailLogAction = mock();
const listStaffLogsAction = mock();
mock.module("../../app/(LogsModule)/admin/_/actions.ts", () => ({ getEmailLogAction, listStaffLogsAction }));

React = await import("react");
const { render: baseRender, fireEvent, screen, cleanup, within, act, waitFor } = await import("@testing-library/react");
const { withIntl } = await import("../helpers/intl.jsx");
/** Every tree renders inside the English catalog, as the root layout provides it. */
const render = (ui, options) => baseRender(ui, { wrapper: withIntl(), ...options });
const { ActionProvider } = await import("../../src/lib/actions");
const { ViewerProvider } = await import("../../src/components/shell/ViewerProvider");
const { EmailLogsList } = await import("../../app/(LogsModule)/admin/_/components/emailLogs/EmailLogsList");
const { StaffLogsList } = await import("../../app/(LogsModule)/admin/_/components/staffLogs/StaffLogsList");
const { StaffLogMessage } = await import("../../app/(LogsModule)/admin/_/components/staffLogs/StaffLogMessage");
const { StaffLogWidget } = await import("../../app/(LogsModule)/admin/_/components/staffLogs/StaffLogWidget");
const { EMAIL_LOGS_QUERY_DEFAULTS, STAFF_LOGS_QUERY_DEFAULTS } = await import("../../app/(LogsModule)/admin/_/queryState");
const { SEARCH_DEBOUNCE_MS } = await import("../../src/lib/data-table/useTableNavigation");
const { default: EmailLogsError } = await import("../../app/(LogsModule)/admin/email-logs/error");
const { default: StaffLogsError } = await import("../../app/(LogsModule)/admin/staff-logs/error");

const ID_A = "01900000-0000-7000-8000-00000000000a";
const ID_B = "01900000-0000-7000-8000-00000000000b";
const ID_C = "01900000-0000-7000-8000-00000000000c";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const requester = { kind: "user", id: "user-ada", label: "Ada Lovelace" };
const emailItem = (id, overrides = {}) => ({
  id,
  startedAt: "2026-09-26T10:15:00.000Z",
  recipientEmail: "alice@example.test",
  recipientUserId: "user-42",
  recipientLabel: "Alice",
  subject: "[REDACTED] is your verification code",
  status: "accepted",
  attemptNumber: 1,
  originalLogId: null,
  requester,
  ...overrides,
});
const emailDetail = (id, overrides = {}) => ({
  ...emailItem(id),
  createdAt: "2026-09-26T10:15:00.000Z",
  updatedAt: "2026-09-26T10:15:02.000Z",
  completedAt: "2026-09-26T10:15:02.000Z",
  contentText: `Body of ${id}.\nYour code is [REDACTED].`,
  provider: "resend",
  providerMessageId: "msg_123",
  previousAttemptId: null,
  requestId: "req-1",
  errorCode: null,
  errorMessage: null,
  stackTrace: null,
  redactionVersion: 1,
  attempts: { items: [{ id, startedAt: "2026-09-26T10:15:00.000Z", status: "accepted", attemptNumber: 1, requester }], page: 1, pageSize: 20, total: 1 },
  ...overrides,
});
const emailPage = (overrides = {}) => ({
  items: [emailItem(ID_A), emailItem(ID_B, { attemptNumber: 3, originalLogId: ID_C, status: "failed", recipientLabel: null, recipientUserId: null })],
  total: 2,
  page: 1,
  pageSize: 25,
  query: EMAIL_LOGS_QUERY_DEFAULTS,
  asOf: "2026-09-27T12:00:00.000Z",
  range: { from: "2026-08-28T12:00:00.000Z", until: "2026-09-27T12:00:00.001Z" },
  ...overrides,
});

function renderEmailList(page = emailPage(), role = "admin") {
  return render(
    <ViewerProvider viewer={{ name: "Viewer", email: "v@example.test", image: null, role }}>
      <ActionProvider>
        <h1 id="email-logs-heading" tabIndex={-1}>
          Email logs
        </h1>
        <EmailLogsList page={page} headingId="email-logs-heading" />
      </ActionProvider>
    </ViewerProvider>,
  );
}

const dialog = () => screen.queryByRole("dialog");
const globalAlertDismiss = () => screen.queryByRole("button", { name: "Dismiss" });

beforeEach(() => {
  nativeReplace(null, "", "/admin/email-logs");
  historyCalls.length = 0;
  push.mockClear();
  replace.mockClear();
  getEmailLogAction.mockReset();
  listStaffLogsAction.mockReset();
  listStaffLogsAction.mockImplementation(async (query) => ({ ok: true, data: staffPage(staffEntries(query), query) }));
  getEmailLogAction.mockImplementation(async ({ id, attemptsPage }) => ({ ok: true, data: emailDetail(id, { attempts: { ...emailDetail(id).attempts, page: attemptsPage } }) }));
});
afterEach(cleanup);

describe("email logs table", () => {
  test("rows show time, recipient snapshot with its user link, subject, status text and attempt", () => {
    renderEmailList();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    expect(first.getByText("Sep 26, 2026, 10:15 AM UTC").getAttribute("datetime")).toBe("2026-09-26T10:15:00.000Z");
    expect(first.getByRole("link", { name: "Alice" }).getAttribute("href")).toBe("/admin/users/user-42");
    expect(first.getByText("alice@example.test")).toBeTruthy();
    expect(first.getByText("Accepted")).toBeTruthy();
    expect(first.getByText("Initial")).toBeTruthy();
    const second = within(rows[1]);
    expect(second.queryByRole("link")).toBeNull();
    expect(second.getByText("Failed")).toBeTruthy();
    expect(second.getByText("Attempt 3")).toBeTruthy();
    expect(second.getByRole("button", { name: "View details of the email to alice@example.test, Sep 26, 2026, 10:15 AM UTC" })).toBeTruthy();
    // Read-only: no sending, deleting or exporting anywhere.
    for (const name of [/resend/i, /send/i, /delete/i, /export/i, /retry/i]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(getEmailLogAction).not.toHaveBeenCalled();
  });

  test("sort headers, filters and page size navigate by push with the page reset; search debounces a replace", async () => {
    renderEmailList(emailPage({ total: 60, page: 2, query: { ...EMAIL_LOGS_QUERY_DEFAULTS, page: 2 } }));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Subject, ascending" }));
    expect(push).toHaveBeenLastCalledWith("/admin/email-logs?sort=subject&direction=asc", { scroll: false });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "unknown" } });
    expect(push).toHaveBeenLastCalledWith("/admin/email-logs?status=unknown", { scroll: false });
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "all" } });
    expect(push).toHaveBeenLastCalledWith("/admin/email-logs?range=all", { scroll: false });
    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "100" } });
    expect(push).toHaveBeenLastCalledWith("/admin/email-logs?pageSize=100", { scroll: false });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search email logs" }), { target: { value: " 50% off " } });
    expect(replace).not.toHaveBeenCalled();
    await act(() => wait(SEARCH_DEBOUNCE_MS + 50));
    expect(replace).toHaveBeenLastCalledWith("/admin/email-logs?q=50%25+off", { scroll: false });
  });

  test("custom dates apply only as an ordered pair; exact filters refuse what the codec would drop", async () => {
    renderEmailList();
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "custom" } });
    expect(push).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-09-20" } });
    expect(push).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("To (UTC, included)"), { target: { value: "2026-09-10" } });
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("The start date must not be after the end date.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("To (UTC, included)"), { target: { value: "2026-09-21" } });
    expect(push).toHaveBeenLastCalledWith("/admin/email-logs?range=custom&from=2026-09-20&to=2026-09-21", { scroll: false });

    const recipient = screen.getByLabelText("Recipient email (exact)");
    fireEvent.change(recipient, { target: { value: "not-an-address" } });
    fireEvent.submit(recipient.closest("form"));
    expect(screen.getByText("Enter a complete email address.")).toBeTruthy();
    fireEvent.change(recipient, { target: { value: "Bob@Example.test" } });
    fireEvent.submit(recipient.closest("form"));
    expect(push).toHaveBeenLastCalledWith("/admin/email-logs?recipient=bob%40example.test", { scroll: false });
  });

  test("honest empty states: nothing in the period, nothing recorded at all, or nothing matching", () => {
    renderEmailList(emailPage({ items: [], total: 0 }));
    expect(screen.getByText("No email attempts were recorded in the last 30 days.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all time" }));
    expect(push).toHaveBeenLastCalledWith("/admin/email-logs?range=all", { scroll: false });
    cleanup();
    renderEmailList(emailPage({ items: [], total: 0, query: { ...EMAIL_LOGS_QUERY_DEFAULTS, range: "all" } }));
    expect(screen.getByText("No email attempts have been recorded. Attempts appear here once sending is logged.")).toBeTruthy();
    cleanup();
    renderEmailList(emailPage({ items: [], total: 0, query: { ...EMAIL_LOGS_QUERY_DEFAULTS, status: "failed" } }));
    expect(screen.getByText("No email logs match these filters.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" }).at(-1));
    expect(push).toHaveBeenLastCalledWith("/admin/email-logs", { scroll: false });
  });
});

test("the list error boundaries say nothing changed and offer Retry", () => {
  for (const [Boundary, title] of [
    [EmailLogsError, "Email logs could not be loaded"],
    [StaffLogsError, "The staff log could not be loaded"],
  ]) {
    const retry = mock();
    render(<Boundary error={new Error("SELECT secret FROM somewhere")} retry={retry} />);
    const alert = within(screen.getByRole("alert"));
    expect(alert.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.queryByText(/SELECT secret/)).toBeNull();
    fireEvent.click(alert.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
    cleanup();
  }
});

describe("email log dialog", () => {
  test("opening pushes ?log=, loads on demand, and closing replaces it and returns focus to the opener", async () => {
    nativeReplace(null, "", "/admin/email-logs?sort=subject");
    renderEmailList(emailPage({ query: { ...EMAIL_LOGS_QUERY_DEFAULTS, sort: "subject" } }));
    const opener = screen.getAllByRole("button", { name: /View details/ })[0];
    opener.focus();
    fireEvent.click(opener);
    expect(historyCalls).toEqual([["push", `/admin/email-logs?sort=subject&log=${ID_A}`]]);
    const view = within(await screen.findByRole("dialog", { name: "Email attempt" }));
    expect(getEmailLogAction).toHaveBeenCalledWith({ id: ID_A, attemptsPage: 1 });
    expect(await view.findByText(`Body of ${ID_A}.`, { exact: false })).toBeTruthy();
    expect(view.getByText("Accepted by the provider. Delivery to the inbox is not tracked.")).toBeTruthy();
    expect(view.getByText("msg_123")).toBeTruthy();
    // No diagnostics section without diagnostics.
    expect(view.queryByRole("heading", { name: "Diagnostics" })).toBeNull();
    // Table criteria keep the selection.
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });
    expect(push).toHaveBeenLastCalledWith(`/admin/email-logs?status=failed&sort=subject&log=${ID_A}`, { scroll: false });

    fireEvent.click(view.getAllByRole("button", { name: "Close" }).at(-1));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(historyCalls.at(-1)).toEqual(["replace", "/admin/email-logs?sort=subject"]);
    await waitFor(() => expect(document.activeElement === opener).toBe(true));
    // Viewing records nothing and sends nothing: one read, no other action.
    expect(getEmailLogAction).toHaveBeenCalledTimes(1);
  });

  test("a direct link opens the dialog; closing focuses the list heading", async () => {
    nativeReplace(null, "", `/admin/email-logs?log=${ID_B}`);
    renderEmailList();
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(await screen.findByText(`Body of ${ID_B}.`, { exact: false })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(dialog()).toBeNull());
    expect(window.location.search).toBe("");
    await waitFor(() => expect(document.activeElement?.id).toBe("email-logs-heading"));
  });

  test("Back/Forward move the selection; a slow response for an earlier record never shows", async () => {
    const slow = deferred();
    getEmailLogAction.mockImplementation(async ({ id }) => (id === ID_A ? slow.promise : { ok: true, data: emailDetail(id) }));
    renderEmailList();
    fireEvent.click(screen.getAllByRole("button", { name: /View details/ })[0]);
    await screen.findByRole("status", { name: "Loading email log" });
    act(() => travel(`/admin/email-logs?log=${ID_B}`));
    expect(await screen.findByText(`Body of ${ID_B}.`, { exact: false })).toBeTruthy();
    await act(async () => slow.resolve({ ok: true, data: emailDetail(ID_A) }));
    await act(() => wait(10));
    expect(screen.queryByText(`Body of ${ID_A}.`, { exact: false })).toBeNull();
    expect(screen.getByText(`Body of ${ID_B}.`, { exact: false })).toBeTruthy();
    act(() => travel("/admin/email-logs"));
    await waitFor(() => expect(dialog()).toBeNull());
    act(() => travel(`/admin/email-logs?log=${ID_A}`));
    expect(await screen.findByText(`Body of ${ID_A}.`, { exact: false })).toBeTruthy();
  });

  test("attempts: links select another attempt by push; pages load in place and restart per record", async () => {
    const chain = (page) => ({
      items: Array.from({ length: page === 1 ? 20 : 5 }, (_, index) => {
        const number = (page - 1) * 20 + index + 1;
        const id = number === 25 ? ID_A : `01900000-0000-7000-8000-${String(number).padStart(12, "0")}`;
        return { id, startedAt: "2026-09-26T10:15:00.000Z", status: "failed", attemptNumber: number, requester };
      }),
      page,
      pageSize: 20,
      total: 25,
    });
    const second = deferred();
    getEmailLogAction.mockImplementation(async ({ id, attemptsPage }) => {
      if (attemptsPage === 2) return second.promise;
      return { ok: true, data: emailDetail(id, { attemptNumber: 25, originalLogId: ID_C, previousAttemptId: ID_B, attempts: chain(1) }) };
    });
    renderEmailList();
    fireEvent.click(screen.getAllByRole("button", { name: /View details/ })[0]);
    const view = within(await screen.findByRole("dialog"));
    expect(await view.findByText("Attempts 1–20 of 25")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Next attempts" }));
    expect(getEmailLogAction).toHaveBeenLastCalledWith({ id: ID_A, attemptsPage: 2 });
    // The loaded record stays visible while the next attempts page loads.
    expect(view.getByText(`Body of ${ID_A}.`, { exact: false })).toBeTruthy();
    await act(async () => second.resolve({ ok: true, data: emailDetail(ID_A, { attemptNumber: 25, attempts: chain(2) }) }));
    expect(await view.findByText("Attempts 21–25 of 25")).toBeTruthy();
    expect(view.getByText("(shown)")).toBeTruthy();

    const link = view.getByRole("link", { name: "Attempt #21" });
    expect(link.getAttribute("href")).toBe("/admin/email-logs?log=01900000-0000-7000-8000-000000000021");
    fireEvent.click(link);
    expect(historyCalls.at(-1)).toEqual(["push", "/admin/email-logs?log=01900000-0000-7000-8000-000000000021"]);
    await waitFor(() =>
      expect(getEmailLogAction).toHaveBeenLastCalledWith({ id: "01900000-0000-7000-8000-000000000021", attemptsPage: 1 }),
    );
    expect(view.getByRole("link", { name: "View the initial attempt" }).getAttribute("href")).toBe(`/admin/email-logs?log=${ID_C}`);
  });

  test("not found stays in the dialog without a shared alert; refusals use shared handling and keep nothing", async () => {
    getEmailLogAction.mockResolvedValueOnce({ ok: false, reason: "NOT_FOUND", status: 404, message: "This log is not available." });
    nativeReplace(null, "", `/admin/email-logs?log=${ID_A}`);
    renderEmailList();
    const view = within(await screen.findByRole("dialog"));
    expect(await view.findByText("This log is not available")).toBeTruthy();
    expect(globalAlertDismiss()).toBeNull();
    cleanup();

    getEmailLogAction.mockResolvedValueOnce({ ok: false, reason: "FORBIDDEN", status: 403, message: "Not allowed." });
    renderEmailList();
    expect(await screen.findByText("You can no longer view this log")).toBeTruthy();
    expect(globalAlertDismiss()).toBeTruthy();
    expect(screen.queryByText("Body of", { exact: false })).toBeNull();
  });

  test("React's development double mount still loads the selected record once it settles", async () => {
    nativeReplace(null, "", `/admin/email-logs?log=${ID_A}`);
    render(
      <React.StrictMode>
        <ViewerProvider viewer={{ name: "Viewer", email: "v@example.test", image: null, role: "admin" }}>
          <ActionProvider>
            <EmailLogsList page={emailPage()} headingId="email-logs-heading" />
          </ActionProvider>
        </ViewerProvider>
      </React.StrictMode>,
    );
    expect(await screen.findByText(`Body of ${ID_A}.`, { exact: false })).toBeTruthy();
    expect(screen.queryByText("The log could not be loaded")).toBeNull();
  });

  test("a failed read offers Retry, which repeats the read only", async () => {
    getEmailLogAction.mockResolvedValueOnce({ ok: false, reason: "TRANSPORT", status: 0, message: "Network" });
    nativeReplace(null, "", `/admin/email-logs?log=${ID_A}`);
    renderEmailList();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText(`Body of ${ID_A}.`, { exact: false })).toBeTruthy();
    expect(getEmailLogAction).toHaveBeenCalledTimes(2);
    expect(globalAlertDismiss()).toBeNull();
  });

  test("stored content is text: markup is escaped and loads nothing; Copy copies the redacted value", async () => {
    const payload = '<img src="https://evil.test/x.png" onerror="alert(1)"><script>alert(2)</script>';
    getEmailLogAction.mockResolvedValue({
      ok: true,
      data: emailDetail(ID_A, {
        subject: payload,
        contentText: `Hello ${payload}\n[REDACTED LINK]`,
        recipientLabel: payload,
        status: "failed",
        errorCode: "PROVIDER_REJECTED",
        errorMessage: payload,
        stackTrace: "Error: boom\n    at send (mailer.ts:1:1)",
      }),
    });
    const writeText = mock(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    nativeReplace(null, "", `/admin/email-logs?log=${ID_A}`);
    renderEmailList();
    const view = within(await screen.findByRole("dialog"));
    await view.findByRole("heading", { name: "Diagnostics" });
    const root = screen.getByRole("dialog");
    expect(root.querySelector("img, script, iframe")).toBeNull();
    expect(root.textContent).toContain(payload);
    expect(view.getByText("Stack trace").closest("details").open).toBe(false);
    fireEvent.click(view.getByRole("button", { name: "Copy redacted content" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`Hello ${payload}\n[REDACTED LINK]`));
    fireEvent.click(view.getByRole("button", { name: "Copy stack trace" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("Error: boom\n    at send (mailer.ts:1:1)"));
  });

  test("a record outside the list criteria is shown with a note; a stale sending attempt says no completion was recorded", async () => {
    getEmailLogAction.mockResolvedValue({
      ok: true,
      data: emailDetail(ID_A, { status: "sending", completedAt: null, startedAt: "2026-09-26T10:00:00.000Z" }),
    });
    nativeReplace(null, "", `/admin/email-logs?status=failed&log=${ID_A}`);
    renderEmailList(emailPage({ query: { ...EMAIL_LOGS_QUERY_DEFAULTS, status: "failed" } }));
    const view = within(await screen.findByRole("dialog"));
    expect(await view.findByText(/outside the current list filters/)).toBeTruthy();
    expect(await view.findByText("No completion recorded.")).toBeTruthy();
    expect(view.getByText("No completion recorded")).toBeTruthy();
    cleanup();
    // A fresh attempt is simply not completed yet.
    getEmailLogAction.mockResolvedValue({
      ok: true,
      data: emailDetail(ID_A, { status: "sending", completedAt: null, startedAt: new Date(Date.now() - 60_000).toISOString() }),
    });
    renderEmailList(emailPage({ query: { ...EMAIL_LOGS_QUERY_DEFAULTS, status: "failed" } }));
    const fresh = within(await screen.findByRole("dialog"));
    expect(await fresh.findByText("Not completed yet")).toBeTruthy();
    expect(fresh.queryByText("No completion recorded.")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

const viewerOf = (role) => ({ name: "Viewer", email: "v@example.test", image: null, role });
const banned = [
  { type: "text", value: "Banned " },
  { type: "user", id: "user-42", label: "Anna" },
  { type: "text", value: " until " },
  { type: "date", value: "2026-09-25T14:32:00.000Z" },
];
const unbanned = [
  { type: "text", value: "Unbanned " },
  { type: "user", id: "user-42", label: "Anna" },
];
const staffItem = (id, overrides = {}) => ({
  id,
  createdAt: "2026-09-26T09:00:00.000Z",
  actor: { id: "root-user-id", name: "Root" },
  action: "user.banned",
  resource: { type: "user", id: "user-42" },
  message: banned,
  ...overrides,
});
const STAFF_TOTAL = 25;
/** The entries a page of `total` holds, each saying its own number. */
const staffEntries = ({ page, pageSize }, total = STAFF_TOTAL) =>
  Array.from({ length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) }, (_, index) => {
    const number = (page - 1) * pageSize + index + 1;
    return staffItem(`01900000-0000-7000-8000-${String(number).padStart(12, "0")}`, {
      message: [{ type: "text", value: `Entry ${number} for ` }, { type: "user", id: "user-42", label: "Anna" }],
    });
  });
const staffPage = (items, query = {}, total = items.length === 0 ? 0 : Math.max(items.length, STAFF_TOTAL)) => {
  const full = { ...STAFF_LOGS_QUERY_DEFAULTS, ...query };
  return {
    items,
    total: items.length < full.pageSize && full.page === 1 ? items.length : total,
    page: full.page,
    pageSize: full.pageSize,
    query: full,
    asOf: "2026-09-27T12:00:00.000Z",
    range: { from: "2026-08-28T12:00:00.000Z", until: "2026-09-27T12:00:00.001Z" },
  };
};
const staffOptions = {
  actors: [
    { id: "root-user-id", name: "Root" },
    { id: "admin-2", name: "Second admin" },
  ],
  actions: ["user.banned", "user.unbanned"],
};

function renderStaffList(page = staffPage([staffItem(ID_A), staffItem(ID_B, { message: unbanned, action: "user.unbanned" })]), role = "admin") {
  nativeReplace(null, "", "/admin/staff-logs");
  historyCalls.length = 0;
  return render(
    <ViewerProvider viewer={viewerOf(role)}>
      <ActionProvider>
        <StaffLogsList page={page} options={staffOptions} />
      </ActionProvider>
    </ViewerProvider>,
  );
}
const widget = (props, role = "admin") => (
  <ViewerProvider viewer={viewerOf(role)}>
    <ActionProvider>
      <StaffLogWidget {...props} />
    </ActionProvider>
  </ViewerProvider>
);
/** The widget lives in another module's page: here, a user's. */
function renderWidget(props, role = "admin") {
  nativeReplace(null, "", "/admin/users/user-42");
  historyCalls.length = 0;
  return render(widget(props, role));
}

describe("staff log message", () => {
  const everyBlock = [
    { type: "text", value: "Banned " },
    { type: "user", id: "user-42", label: "Anna" },
    { type: "text", value: " until " },
    { type: "date", value: "2026-09-25T14:32:00.000Z" },
    { type: "text", value: ", see " },
    { type: "url", href: "/admin/users/user-42", label: "the account" },
    { type: "text", value: " and " },
    { type: "url", href: "https://example.test/policy?a=1", label: "the policy" },
    { type: "text", value: ". Reason: " },
    { type: "value", value: "Spam" },
    { type: "text", value: " " },
    { type: "unsupported" },
  ];
  const renderMessage = (blocks, role = "admin") =>
    render(
      <ViewerProvider viewer={viewerOf(role)}>
        <StaffLogMessage blocks={blocks} />
      </ViewerProvider>,
    );

  test("blocks render inline, in order, as one sentence", () => {
    const { container } = renderMessage(everyBlock);
    expect(container.textContent).toBe(
      "Banned Anna until Sep 25, 2026, 02:32 PM UTC, see the account and the policy. Reason: Spam [unsupported content]",
    );
    const sentence = container.firstElementChild;
    expect(sentence.tagName).toBe("SPAN");
    // Nothing but inline elements: the message is part of a line of text.
    expect([...sentence.querySelectorAll("*")].map((element) => element.tagName)).toEqual(["A", "TIME", "A", "A", "SPAN", "SPAN"]);
  });

  test("a user links to their admin page; a date is a machine-readable time; a value stands apart", () => {
    const { container } = renderMessage(everyBlock);
    expect(screen.getByRole("link", { name: "Anna" }).getAttribute("href")).toBe("/admin/users/user-42");
    const time = container.querySelector("time");
    expect(time.textContent).toBe("Sep 25, 2026, 02:32 PM UTC");
    expect(time.getAttribute("datetime")).toBe("2026-09-25T14:32:00.000Z");
    expect(screen.getByText("Spam").tagName).toBe("SPAN");
    expect(screen.getByText("[unsupported content]")).toBeTruthy();
  });

  test("an application path stays in the tab; an external address opens apart, without an opener", () => {
    renderMessage(everyBlock);
    const inside = screen.getByRole("link", { name: "the account" });
    expect(inside.getAttribute("href")).toBe("/admin/users/user-42");
    expect(inside.getAttribute("target")).toBeNull();
    const outside = screen.getByRole("link", { name: "the policy" });
    expect(outside.getAttribute("href")).toBe("https://example.test/policy?a=1");
    expect(outside.getAttribute("target")).toBe("_blank");
    expect(outside.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("a viewer who may not open the user's page reads the name as plain text", () => {
    const { container } = renderMessage(banned, "user");
    expect(screen.queryByRole("link", { name: "Anna" })).toBeNull();
    expect(screen.getByText("Anna").tagName).toBe("SPAN");
    expect(container.textContent).toBe("Banned Anna until Sep 25, 2026, 02:32 PM UTC");
  });

  test("stored content is text: markup is escaped and loads nothing", () => {
    const payload = '<img src="https://evil.test/x.png" onerror="alert(1)"><script>alert(2)</script>';
    const { container } = renderMessage([
      { type: "text", value: payload },
      { type: "user", id: "user-42", label: payload },
      { type: "value", value: payload },
      { type: "url", href: "/admin", label: payload },
    ]);
    expect(container.querySelector("img, script, iframe")).toBeNull();
    expect(container.textContent).toBe(payload.repeat(4));
  });

  test("an empty message renders nothing but its wrapper", () => {
    const { container } = renderMessage([]);
    expect(container.textContent).toBe("");
  });
});

describe("staff log list", () => {
  test("rows show the time, the staff member as named now, and the message", () => {
    renderStaffList();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Time", "Staff member", "Action"]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    expect(first.getAllByText("Sep 26, 2026, 09:00 AM UTC")[0].getAttribute("datetime")).toBe("2026-09-26T09:00:00.000Z");
    expect(first.getByRole("link", { name: "Root" }).getAttribute("href")).toBe("/admin/users/root-user-id");
    expect(first.getByRole("link", { name: "Anna" }).getAttribute("href")).toBe("/admin/users/user-42");
    expect(rows[0].textContent).toContain("Banned Anna until Sep 25, 2026, 02:32 PM UTC");
    expect(rows[1].textContent).toContain("Unbanned Anna");
    // Newest first, always: no sort controls. Read-only: no dialog, nothing to delete or export.
    expect(screen.queryByRole("button", { name: /Sort by/ })).toBeNull();
    for (const name of [/view details/i, /delete/i, /export/i, /edit/i]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(dialog()).toBeNull();
  });

  test("filters, page size and paging navigate by push with the page reset; search debounces a replace", async () => {
    renderStaffList(staffPage(staffEntries({ page: 2, pageSize: 25 }, 60), { page: 2 }, 60));
    fireEvent.change(screen.getByLabelText("Staff member"), { target: { value: "admin-2" } });
    expect(push).toHaveBeenLastCalledWith("/admin/staff-logs?actor=admin-2", { scroll: false });
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "user.unbanned" } });
    expect(push).toHaveBeenLastCalledWith("/admin/staff-logs?action=user.unbanned", { scroll: false });
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "all" } });
    expect(push).toHaveBeenLastCalledWith("/admin/staff-logs?range=all", { scroll: false });
    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "100" } });
    expect(push).toHaveBeenLastCalledWith("/admin/staff-logs?pageSize=100", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(push).toHaveBeenLastCalledWith("/admin/staff-logs?page=3", { scroll: false });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the staff log" }), { target: { value: " banned " } });
    expect(replace).not.toHaveBeenCalled();
    await act(() => wait(SEARCH_DEBOUNCE_MS + 50));
    expect(replace).toHaveBeenLastCalledWith("/admin/staff-logs?q=banned", { scroll: false });
    // The list is the server's page: the widget's read is never used here.
    expect(listStaffLogsAction).not.toHaveBeenCalled();
  });

  test("the selects offer what the log contains, plus a value the URL carries that it no longer offers", () => {
    const optionsOf = (label) =>
      within(screen.getByLabelText(label))
        .getAllByRole("option")
        .map((option) => [option.value, option.textContent]);
    renderStaffList();
    expect(optionsOf("Staff member")).toEqual([
      ["", "Anyone"],
      ["root-user-id", "Root"],
      ["admin-2", "Second admin"],
    ]);
    expect(optionsOf("Action")).toEqual([
      ["", "Any action"],
      ["user.banned", "user.banned"],
      ["user.unbanned", "user.unbanned"],
    ]);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    cleanup();

    const query = { actorId: "gone-admin", actions: ["user.removed"], resourceId: "user-42", pageSize: 50 };
    renderStaffList(staffPage([staffItem(ID_A)], query));
    expect(screen.getByLabelText("Staff member").value).toBe("gone-admin");
    expect(optionsOf("Staff member").at(-1)).toEqual(["gone-admin", "gone-admin"]);
    expect(screen.getByLabelText("Action").value).toBe("user.removed");
    expect(optionsOf("Action").at(-1)).toEqual(["user.removed", "user.removed"]);
    // Changing one filter keeps the others, the resource from the link included.
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "" } });
    expect(push).toHaveBeenLastCalledWith("/admin/staff-logs?actor=gone-admin&resourceId=user-42&pageSize=50", {
      scroll: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(push).toHaveBeenLastCalledWith("/admin/staff-logs?pageSize=50", { scroll: false });
  });

  test("honest empty states: nothing in the period, nothing logged at all, or nothing matching", () => {
    renderStaffList(staffPage([]));
    expect(screen.getByText("No staff actions were recorded in the last 30 days.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all time" }));
    expect(push).toHaveBeenLastCalledWith("/admin/staff-logs?range=all", { scroll: false });
    cleanup();
    renderStaffList(staffPage([], { range: "all" }));
    expect(screen.getByText("No staff actions have been logged yet.")).toBeTruthy();
    cleanup();
    renderStaffList(staffPage([], { resourceId: "user-42" }));
    expect(screen.getByText("No staff actions match these filters.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" }).at(-1));
    expect(push).toHaveBeenLastCalledWith("/admin/staff-logs", { scroll: false });
  });
});

describe("staff log widget", () => {
  const entriesOf = () => within(screen.getByRole("list", { name: "Staff actions" })).getAllByRole("listitem");
  const untouchedUrl = () => {
    expect(historyCalls).toEqual([]);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe("/admin/users/user-42");
  };

  test("renders nothing and reads nothing for a viewer who may not open the staff log", async () => {
    for (const role of ["moderator", "user"]) {
      const { container } = renderWidget({ resourceId: "user-42" }, role);
      await act(() => wait(10));
      expect(container.textContent).toBe("");
      expect(screen.queryByRole("searchbox")).toBeNull();
      cleanup();
    }
    expect(listStaffLogsAction).not.toHaveBeenCalled();
  });

  test("an admin sees a loading state, then the entries: who, what and when", async () => {
    const answer = deferred();
    listStaffLogsAction.mockImplementation(async () => answer.promise);
    renderWidget({ resourceId: "user-42" });
    expect(await screen.findByRole("status", { name: "Loading the staff log" })).toBeTruthy();
    await act(async () => answer.resolve({ ok: true, data: staffPage([staffItem(ID_A), staffItem(ID_B, { message: unbanned })]) }));
    await waitFor(() => expect(entriesOf()).toHaveLength(2));
    const [first, second] = entriesOf();
    expect(first.textContent).toBe("Root: Banned Anna until Sep 25, 2026, 02:32 PM UTCSep 26, 2026, 09:00 AM UTC");
    expect(within(first).getByRole("link", { name: "Root" }).getAttribute("href")).toBe("/admin/users/root-user-id");
    expect(within(first).getByRole("link", { name: "Anna" }).getAttribute("href")).toBe("/admin/users/user-42");
    expect(second.textContent).toContain("Root: Unbanned Anna");
    expect(screen.queryByRole("status", { name: "Loading the staff log" })).toBeNull();
    expect(listStaffLogsAction).toHaveBeenCalledTimes(1);
    // Read-only, like the lists.
    for (const name of [/delete/i, /export/i, /edit/i]) expect(screen.queryByRole("button", { name })).toBeNull();
    untouchedUrl();
  });

  test("the props become the query: all time, ten per page, first page", async () => {
    renderWidget({ resourceId: "user-42" });
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(1));
    expect(listStaffLogsAction.mock.calls[0][0]).toEqual({
      ...STAFF_LOGS_QUERY_DEFAULTS,
      range: "all",
      resourceId: "user-42",
      pageSize: 10,
    });
    cleanup();

    listStaffLogsAction.mockClear();
    renderWidget({ actorId: "root-user-id", action: "user.banned" });
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(1));
    expect(listStaffLogsAction.mock.calls[0][0]).toEqual({
      ...STAFF_LOGS_QUERY_DEFAULTS,
      range: "all",
      actorId: "root-user-id",
      actions: ["user.banned"],
      pageSize: 10,
    });
    cleanup();

    listStaffLogsAction.mockClear();
    renderWidget({ resourceId: "user-42", action: ["user.banned", "user.unbanned"] });
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(1));
    expect(listStaffLogsAction.mock.calls[0][0]).toMatchObject({
      resourceId: "user-42",
      resourceType: "",
      actorId: "",
      actions: ["user.banned", "user.unbanned"],
    });
  });

  test("the label names the list and its search", async () => {
    renderWidget({ resourceId: "user-42", label: "Staff actions on this user" });
    expect(await screen.findByRole("list", { name: "Staff actions on this user" })).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search staff actions on this user" })).toBeTruthy();
  });

  test("searching reads again from the first page after the debounce, without touching the URL", async () => {
    renderWidget({ resourceId: "user-42" });
    await waitFor(() => expect(entriesOf()).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(2));
    await screen.findByText("11–20 of 25 staff actions");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search staff actions" }), { target: { value: " banned " } });
    expect(listStaffLogsAction).toHaveBeenCalledTimes(2);
    await act(() => wait(SEARCH_DEBOUNCE_MS + 50));
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(3));
    expect(listStaffLogsAction.mock.calls[2][0]).toEqual({
      ...STAFF_LOGS_QUERY_DEFAULTS,
      range: "all",
      q: "banned",
      resourceId: "user-42",
      page: 1,
      pageSize: 10,
    });
    untouchedUrl();
  });

  test("Enter applies the search at once; an empty result says nothing matches", async () => {
    listStaffLogsAction.mockImplementation(async (query) => ({
      ok: true,
      data: staffPage(query.q ? [] : [staffItem(ID_A)], query),
    }));
    renderWidget({ resourceId: "user-42" });
    await waitFor(() => expect(entriesOf()).toHaveLength(1));
    const search = screen.getByRole("searchbox", { name: "Search staff actions" });
    fireEvent.change(search, { target: { value: "nothing" } });
    fireEvent.submit(search.closest("form"));
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(2));
    expect(listStaffLogsAction.mock.calls[1][0]).toMatchObject({ q: "nothing", page: 1 });
    expect(await screen.findByText("No staff actions match this search.")).toBeTruthy();
    // The debounce that was pending does not read a second time.
    await act(() => wait(SEARCH_DEBOUNCE_MS + 50));
    expect(listStaffLogsAction).toHaveBeenCalledTimes(2);
    untouchedUrl();
  });

  test("an empty log says so and offers no pagination", async () => {
    listStaffLogsAction.mockImplementation(async (query) => ({ ok: true, data: staffPage([], query) }));
    renderWidget({ resourceId: "user-42" });
    expect(await screen.findByText("No staff actions have been logged here.")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });

  test("paging and the page size read again with the new query, without touching the URL", async () => {
    renderWidget({ resourceId: "user-42" });
    await waitFor(() => expect(entriesOf()).toHaveLength(10));
    expect(screen.getByText("1–10 of 25 staff actions")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(2));
    expect(listStaffLogsAction.mock.calls[1][0]).toMatchObject({ resourceId: "user-42", page: 2, pageSize: 10 });
    expect(await screen.findByText("11–20 of 25 staff actions")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "25" } });
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(3));
    expect(listStaffLogsAction.mock.calls[2][0]).toMatchObject({ resourceId: "user-42", page: 1, pageSize: 25 });
    expect(await screen.findByText("1–25 of 25 staff actions")).toBeTruthy();
    expect(within(screen.getByLabelText("Rows per page")).getAllByRole("option").map((option) => option.value)).toEqual([
      "10",
      "25",
    ]);
    untouchedUrl();
  });

  test("the entries stay while the next page loads; an answer to an earlier query never shows", async () => {
    const second = deferred();
    listStaffLogsAction.mockImplementation(async (query) =>
      query.page === 2 ? second.promise : { ok: true, data: staffPage(staffEntries(query), query) },
    );
    renderWidget({ resourceId: "user-42" });
    await waitFor(() => expect(entriesOf()).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(2));
    expect(entriesOf()).toHaveLength(10);
    expect(screen.queryByRole("status", { name: "Loading the staff log" })).toBeNull();
    await act(async () =>
      second.resolve({ ok: true, data: staffPage(staffEntries({ page: 2, pageSize: 10 }), { page: 2, pageSize: 10 }) }),
    );
    expect(await screen.findByText("11–20 of 25 staff actions")).toBeTruthy();
  });

  test("a changed revision reads the same query again", async () => {
    const view = renderWidget({ resourceId: "user-42", revision: 1 });
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(entriesOf()).toHaveLength(10));
    view.rerender(widget({ resourceId: "user-42", revision: 2 }));
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(2));
    expect(listStaffLogsAction.mock.calls[1][0]).toEqual(listStaffLogsAction.mock.calls[0][0]);
  });

  test("a failed read offers Retry, which repeats the read only", async () => {
    listStaffLogsAction.mockResolvedValueOnce({ ok: false, reason: "TRANSPORT", status: 0, message: "Network" });
    renderWidget({ resourceId: "user-42" });
    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText("The staff log could not be loaded.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Staff actions" })).toBeNull();
    expect(globalAlertDismiss()).toBeNull();
    fireEvent.click(alert.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(entriesOf()).toHaveLength(10));
    expect(listStaffLogsAction).toHaveBeenCalledTimes(2);
    expect(listStaffLogsAction.mock.calls[1][0]).toEqual(listStaffLogsAction.mock.calls[0][0]);
    untouchedUrl();
  });

  test("a refusal keeps nothing on screen and offers no Retry", async () => {
    listStaffLogsAction.mockResolvedValue({ ok: false, reason: "NOT_FOUND", status: 404, message: "This log is not available." });
    renderWidget({ resourceId: "user-42" });
    await waitFor(() => expect(listStaffLogsAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("searchbox")).toBeNull());
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Staff actions" })).toBeNull();
  });
});
