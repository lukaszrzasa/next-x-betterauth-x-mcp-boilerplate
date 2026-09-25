import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDom } from "../helpers/dom";

installDom();

const push = mock();
const replace = mock();
mock.module("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: () => {} }),
}));

const { renderHook, act, cleanup } = await import("@testing-library/react");
const { useTableNavigation, SEARCH_DEBOUNCE_MS } = await import("../../src/lib/data-table/useTableNavigation");

const serialize = (query) => (query.q ? `?q=${encodeURIComponent(query.q)}` : "");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});
afterEach(cleanup);

function setup(query = { q: "" }) {
  return renderHook((props) => useTableNavigation({ pathname: "/list", serialize, ...props }), {
    initialProps: { query },
  });
}

test("pushes filters immediately and replaces search after the debounce", async () => {
  const { result } = setup();
  act(() => result.current.navigate({ q: "a" }));
  expect(push).toHaveBeenCalledWith("/list?q=a", { scroll: false });
  act(() => result.current.navigateDebounced({ q: "ab" }));
  expect(replace).not.toHaveBeenCalled();
  await act(() => wait(SEARCH_DEBOUNCE_MS + 20));
  expect(replace).toHaveBeenCalledWith("/list?q=ab", { scroll: false });
});

test("only the newest debounced intent fires; Enter flushes it now", async () => {
  const { result } = setup();
  act(() => result.current.navigateDebounced({ q: "a" }));
  act(() => result.current.navigateDebounced({ q: "ab" }));
  act(() => result.current.navigateDebounced({ q: "abc" }));
  await act(() => wait(SEARCH_DEBOUNCE_MS + 20));
  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenLastCalledWith("/list?q=abc", { scroll: false });
  act(() => result.current.navigateDebounced({ q: "abcd" }));
  act(() => result.current.flush());
  expect(replace).toHaveBeenLastCalledWith("/list?q=abcd", { scroll: false });
  await act(() => wait(SEARCH_DEBOUNCE_MS + 20));
  expect(replace).toHaveBeenCalledTimes(2);
  // Flushing with nothing scheduled navigates nowhere.
  act(() => result.current.flush());
  expect(replace).toHaveBeenCalledTimes(2);
});

test("a push cancels a pending debounce so a stale search cannot overwrite a filter change", async () => {
  const { result } = setup();
  act(() => result.current.navigateDebounced({ q: "typed" }));
  act(() => result.current.navigate({ q: "filter" }));
  await act(() => wait(SEARCH_DEBOUNCE_MS + 20));
  expect(push).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
});

test("a URL change from outside (Back/Forward) discards what was still being typed", async () => {
  const { result, rerender } = setup({ q: "" });
  act(() => result.current.navigateDebounced({ q: "typed" }));
  rerender({ query: { q: "history" } });
  await act(() => wait(SEARCH_DEBOUNCE_MS + 20));
  expect(replace).not.toHaveBeenCalled();
  // Navigating to the state the URL already shows is a no-op.
  act(() => result.current.navigate({ q: "history" }));
  expect(push).not.toHaveBeenCalled();
});
