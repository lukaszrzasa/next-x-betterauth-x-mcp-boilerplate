"use client";

import { useEffect, useState } from "react";

/**
 * Seconds remaining, ticking down once a second in the browser only. Key it
 * by its deadline so a new one mounts a fresh countdown. `render` turns the
 * remaining seconds into text; the default is a plain count.
 */
export function Countdown({
  seconds,
  render = (remaining) => (remaining > 0 ? `${remaining}s` : "now"),
}: {
  seconds: number;
  render?: (remaining: number) => string;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const timer = setInterval(
      () => setRemaining((current) => (current > 0 ? current - 1 : 0)),
      1_000,
    );
    return () => clearInterval(timer);
  }, []);

  return <span aria-live="off">{render(remaining)}</span>;
}
