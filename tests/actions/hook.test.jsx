import { afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

// The verification modal is a Radix dialog, which needs the same DOM globals
// as the shell suite (focus scope, dismissable layer, scroll lock).
const browser = new Window({ url: "http://localhost" });
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLDialogElement",
  "HTMLButtonElement",
  "HTMLSelectElement",
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
    value:
      key === "window"
        ? browser
        : typeof browser[key] === "function" && key.includes("AnimationFrame")
          ? browser[key].bind(browser)
          : browser[key],
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sendEmail = mock(async () => ({ ok: true }));
mock.module("../../src/lib/auth/stepUpActions", () => ({
  sendStepUpEmail: sendEmail,
}));

const React = await import("react");
const { renderHook, render, act, fireEvent, screen, cleanup, waitFor } =
  await import("@testing-library/react");
const { ActionProvider, useAction } = await import("../../src/lib/actions");
const required = {
  ok: false,
  reason: "TWO_FACTOR_REQUIRED",
  status: 428,
  message: "Verify",
  data: { policy: "five_minutes", methods: ["email"] },
};
const success = { ok: true, data: "saved" };
const failure = {
  ok: false,
  reason: "FORBIDDEN",
  status: 403,
  message: "Not allowed",
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const wrapper = ({ children }) => <ActionProvider>{children}</ActionProvider>;

afterEach(() => {
  cleanup();
  sendEmail.mockClear();
});

test("pending includes the whole request and duplicate execution returns busy", async () => {
  const response = deferred();
  const action = mock(() => response.promise);
  const { result } = renderHook(() => useAction(action), { wrapper });
  let first;
  act(() => {
    first = result.current.execute({ id: 1 });
  });
  expect(result.current.isPending).toBe(true);
  expect(await result.current.execute({ id: 2 })).toEqual({ status: "busy" });
  await act(async () => {
    response.resolve(success);
    await first;
  });
  expect(result.current.isPending).toBe(false);
  expect(result.current.result).toEqual({ status: "success", data: "saved" });
  expect(action).toHaveBeenCalledTimes(1);
});

test("caller-handled errors suppress shared presentation", async () => {
  const shared = mock();
  const local = mock(() => true);
  const { result } = renderHook(
    () => useAction(async () => failure, { onError: local }),
    {
      wrapper: ({ children }) => (
        <ActionProvider onError={shared}>{children}</ActionProvider>
      ),
    },
  );
  await act(async () => {
    await result.current.execute(undefined);
  });
  expect(local).toHaveBeenCalledWith(failure);
  expect(shared).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("unhandled errors fall back to shared presentation", async () => {
  const { result } = renderHook(() => useAction(async () => failure), {
    wrapper,
  });
  await act(async () => {
    await result.current.execute(undefined);
  });
  expect(screen.getByRole("alert").textContent).toContain("Not allowed");
});

test("unmount during an in-flight request suppresses callbacks", async () => {
  const response = deferred();
  const onSuccess = mock();
  const { result, unmount } = renderHook(
    () => useAction(() => response.promise, { onSuccess }),
    { wrapper },
  );
  let pending;
  act(() => {
    pending = result.current.execute(undefined);
  });
  unmount();
  await act(async () => {
    response.resolve(success);
    expect(await pending).toEqual({ status: "cancelled" });
  });
  expect(onSuccess).not.toHaveBeenCalled();
});

test("real react-call modal supports sending, typo correction and successful execution", async () => {
  const action = mock(async (_, meta) =>
    !meta
      ? required
      : meta.stepUp.code === "123456"
        ? success
        : {
            ok: false,
            reason: "STEP_UP_INVALID_CODE",
            status: 401,
            message: "Incorrect code",
          },
  );
  let hook;
  function Consumer() {
    hook = useAction(action);
    return null;
  }
  render(
    <ActionProvider>
      <Consumer />
    </ActionProvider>,
  );
  let pending;
  await act(async () => {
    pending = hook.execute(1);
  });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(hook.isPending).toBe(true);
  await act(async () => {
    fireEvent.click(screen.getByText("Send email code"));
  });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "000000" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
  });
  expect(screen.getByRole("status").textContent).toBe("Incorrect code");
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
  });
  expect(await pending).toEqual({ status: "success", data: "saved" });
  await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
  expect(hook.isPending).toBe(false);
  expect(sendEmail).toHaveBeenCalledTimes(1);
});

test("unmount closes an active modal and lets another consumer proceed", async () => {
  let hook;
  function Consumer() {
    hook = useAction(async () => required);
    return null;
  }
  const view = render(
    <ActionProvider>
      <Consumer />
    </ActionProvider>,
  );
  let pending;
  await act(async () => {
    pending = hook.execute(undefined);
  });
  expect(screen.getByRole("dialog")).toBeTruthy();
  view.rerender(<ActionProvider />);
  await act(async () => {
    expect(await pending).toEqual({ status: "cancelled" });
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  view.rerender(
    <ActionProvider>
      <Consumer />
    </ActionProvider>,
  );
  await act(async () => {
    pending = hook.execute(undefined);
  });
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByText("Cancel"));
  });
  expect(await pending).toEqual({ status: "cancelled" });
  expect(screen.queryByRole("alert")).toBeNull();
});
