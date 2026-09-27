import { Window } from "happy-dom";

/** The value installed as `globalThis[key]`: animation-frame functions stay bound to the window. */
function browserGlobal(browser, key) {
  if (key === "window") return browser;
  const value = browser[key];
  return typeof value === "function" && key.includes("AnimationFrame") ? value.bind(browser) : value;
}

/**
 * A happy-dom document for component suites, with the globals Radix
 * primitives, TanStack Table and Testing Library touch. Call before
 * importing React or any component module.
 */
export function installDom(url = "http://localhost:3000") {
  const browser = new Window({ url });
  for (const key of [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLAnchorElement",
    "HTMLButtonElement",
    "HTMLSelectElement",
    "HTMLTextAreaElement",
    "HTMLFormElement",
    "HTMLDialogElement",
    "HTMLTableElement",
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
    "InputEvent",
    "MutationObserver",
    "ResizeObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ]) {
    if (browser[key] === undefined) continue;
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: browserGlobal(browser, key),
    });
  }
  browser.matchMedia ??= () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return browser;
}
