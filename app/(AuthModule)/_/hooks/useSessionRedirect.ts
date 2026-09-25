"use client";

import { useRouter } from "next/navigation";

/**
 * Navigation after the session cookie changed (sign-in, sign-out, enrollment).
 * The refresh makes server components and route guards re-read the new session
 * instead of serving the cached render from before it changed.
 */
export function useSessionRedirect() {
  const router = useRouter();

  return function redirect(href: string) {
    router.replace(href);
    router.refresh();
  };
}
