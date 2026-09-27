"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-reads the server components when the window regains focus, at most
 * once per `minIntervalMs`: a page showing state that other devices (or an
 * emailed link) can move forward stays current without polling.
 */
export function useRefreshOnFocus(minIntervalMs = 5_000) {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - last.current < minIntervalMs) return;
      last.current = now;
      router.refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router, minIntervalMs]);
}
