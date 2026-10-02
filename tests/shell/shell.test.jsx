import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

/** The value installed as `globalThis[key]`: animation-frame functions stay bound to the window. */
function browserGlobal(browser, key) {
  if (key === "window") return browser;
  const value = browser[key];
  return typeof value === "function" && key.includes("AnimationFrame") ? value.bind(browser) : value;
}

/**
 * The persistent shell in a DOM: chrome per route family, the account menu,
 * desktop sidebar state and the mobile drawer. Runs in its own process
 * because it mocks navigation and the auth client.
 */

const browser = new Window({ url: "http://localhost:3000" });
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLAnchorElement",
  "HTMLButtonElement",
  "SVGElement",
  "Element",
  "Node",
  "NodeFilter",
  "Text",
  "DocumentFragment",
  "DOMRect",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "FocusEvent",
  "PointerEvent",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: browserGlobal(browser, key),
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A controllable viewport: `mobile` decides what matchMedia reports.
let mobile = false;
const mediaListeners = new Set();
browser.matchMedia = () => ({
  get matches() {
    return mobile;
  },
  addEventListener: (_type, listener) => mediaListeners.add(listener),
  removeEventListener: (_type, listener) => mediaListeners.delete(listener),
});
function setMobile(value) {
  mobile = value;
  for (const listener of mediaListeners) listener();
}

let pathname = "/";
const replace = mock();
const refresh = mock();
const signOut = mock(async () => ({ data: { success: true }, error: null }));

mock.module("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace, refresh }),
}));
mock.module("../../src/lib/auth/client.ts", () => ({
  authClient: { signOut },
}));

const React = await import("react");
const { render, fireEvent, screen, cleanup, waitFor, act } =
  await import("@testing-library/react");
const { AppShell, getShellMode } = await import("../../src/components/shell/AppShell");
const { ViewerProvider } = await import("../../src/components/shell/ViewerProvider");
const { IntlWrapper } = await import("../helpers/intl.jsx");

const alice = { name: "Alice Admin", email: "alice@example.com", image: null, role: "admin" };
const mod = { ...alice, name: "Mo Derator", role: "moderator" };
const plain = { ...alice, name: "Plain User", role: "user" };

/** Radix menus open on pointer-down or a key, not on click. */
const openAccountMenu = () =>
  fireEvent.keyDown(screen.getByRole("button", { name: "Account menu" }), { key: "Enter" });

/** The header's trigger; the desktop rail is a second, mouse-only toggle. */
const trigger = () => document.querySelector('[data-sidebar="trigger"]');

function renderShell({
  path = "/",
  user = null,
  defaultSidebarOpen = true,
  children = <p>page body</p>,
} = {}) {
  pathname = path;
  const tree = () => (
    <IntlWrapper>
      <ViewerProvider viewer={user}>
        <AppShell defaultSidebarOpen={defaultSidebarOpen}>{children}</AppShell>
      </ViewerProvider>
    </IntlWrapper>
  );
  const view = render(tree());

  return {
    ...view,
    navigate(next) {
      pathname = next;
      view.rerender(tree());
    },
  };
}

beforeEach(() => {
  mobile = false;
  document.cookie = "sidebar_state=; max-age=0; path=/";
});

afterEach(() => {
  cleanup();
  for (const fn of [replace, refresh, signOut]) fn.mockClear();
});

test("route families map to shell modes", () => {
  expect(getShellMode("/")).toBe("app");
  expect(getShellMode("/panel")).toBe("app");
  expect(getShellMode("/settings/profile")).toBe("app");
  expect(getShellMode("/auth")).toBe("auth");
  expect(getShellMode("/auth/sign-in")).toBe("auth");
  expect(getShellMode("/authors")).toBe("app");
  expect(getShellMode("/admin")).toBe("admin");
  expect(getShellMode("/admin/users")).toBe("admin");
  expect(getShellMode("/administrator")).toBe("app");
});

test("public routes get the top bar with branding and one main landmark; auth routes get nothing", () => {
  const { navigate } = renderShell({ path: "/panel" });
  expect(screen.getByRole("banner")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Boilerplate" }).getAttribute("href")).toBe("/");
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Skip to content" })).toBeTruthy();
  expect(trigger()).toBeNull();
  expect(screen.getByText("page body")).toBeTruthy();

  navigate("/auth/sign-in");
  expect(screen.queryByRole("banner")).toBeNull();
  expect(screen.queryByRole("main")).toBeNull();
  expect(screen.getByText("page body")).toBeTruthy();
});

test("admin routes add the sidebar with filtered groups and an active link; other chrome stays", () => {
  const { navigate } = renderShell({ path: "/admin/users/42", user: alice });
  expect(trigger()).toBeTruthy();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(screen.getByText("General")).toBeTruthy();
  expect(screen.getByText("System")).toBeTruthy();

  const users = screen.getByRole("link", { name: "Users" });
  expect(users.getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  expect(screen.queryByRole("link", { name: "Account" })).toBeNull();

  navigate("/admin/users-other");
  expect(screen.getByRole("link", { name: "Users" }).getAttribute("aria-current")).toBeNull();

  navigate("/panel");
  expect(trigger()).toBeNull();
  expect(screen.queryByRole("link", { name: "Staff log" })).toBeNull();
});

test("moderator navigation omits the System group", () => {
  renderShell({ path: "/admin", user: mod });
  expect(screen.getByRole("link", { name: "Users" })).toBeTruthy();
  expect(screen.queryByText("System")).toBeNull();
  expect(screen.queryByRole("link", { name: "Email logs" })).toBeNull();
});

test("desktop collapse persists as a cookie and survives navigation; mobile leaves it alone", async () => {
  const { navigate } = renderShell({ path: "/admin/users", user: alice });
  const sidebar = () => document.querySelector('[data-slot="sidebar"]');
  expect(sidebar().getAttribute("data-state")).toBe("expanded");

  fireEvent.click(trigger());
  expect(sidebar().getAttribute("data-state")).toBe("collapsed");
  expect(document.cookie).toContain("sidebar_state=false");

  navigate("/admin/staff-logs");
  expect(sidebar().getAttribute("data-state")).toBe("collapsed");

  await act(async () => setMobile(true));
  fireEvent.click(trigger());
  expect(await screen.findByRole("dialog", { name: "Navigation" })).toBeTruthy();
  expect(document.cookie).toContain("sidebar_state=false");

  await act(async () => setMobile(false));
  expect(sidebar().getAttribute("data-state")).toBe("collapsed");
});

test("a collapsed cookie starts the sidebar collapsed", () => {
  renderShell({ path: "/admin", user: alice, defaultSidebarOpen: false });
  expect(document.querySelector('[data-slot="sidebar"]').getAttribute("data-state")).toBe("collapsed");
});

test("the mobile drawer closes on link selection, on path changes and when leaving admin", async () => {
  mobile = true;
  const { navigate } = renderShell({ path: "/admin", user: alice });
  const openDrawer = async () => {
    fireEvent.click(trigger());
    return screen.findByRole("dialog", { name: "Navigation" });
  };

  await openDrawer();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  // Selecting the current destination closes the drawer too.
  fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  await openDrawer();
  navigate("/admin/users");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  await openDrawer();
  navigate("/panel");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  navigate("/admin");
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("guests see a sign-in link instead of the account menu", () => {
  renderShell({ path: "/" });
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth/sign-in");
  expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
});

test("the account menu shows identity, Settings, Admin for staff only, and Sign out", async () => {
  const { unmount } = renderShell({ path: "/panel", user: plain });
  openAccountMenu();
  const menu = await screen.findByRole("menu");
  expect(menu.textContent).toContain("Plain User");
  expect(menu.textContent).toContain("alice@example.com");
  expect(screen.getByRole("menuitem", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  expect(screen.queryByRole("menuitem", { name: "Admin" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Account" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Profile" })).toBeNull();
  expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  unmount();

  renderShell({ path: "/panel", user: mod });
  openAccountMenu();
  expect((await screen.findByRole("menuitem", { name: "Admin" })).getAttribute("href")).toBe("/admin");
});

test("sign-out failure stays in the open menu as an alert; success uses the session redirect", async () => {
  signOut.mockResolvedValueOnce({ data: null, error: { message: "Network down" } });
  renderShell({ path: "/panel", user: alice });
  openAccountMenu();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

  expect((await screen.findByRole("alert")).textContent).toBe("Network down");
  expect(screen.getByRole("menu")).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth/sign-in"));
  expect(refresh).toHaveBeenCalled();
});
