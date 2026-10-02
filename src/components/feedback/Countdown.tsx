"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Seconds remaining, ticking down once a second in the browser only. Key it
 * by its deadline so a new one mounts a fresh countdown. `render` turns the
 * remaining seconds into text; the default is a plain count ("42s", "now").
 */
export function Countdown({
  seconds,
  render,
}: {
  seconds: number;
  render?: (remaining: number) => string;
}) {
  const t = useTranslations("common.countdown");
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const timer = setInterval(
      () => setRemaining((current) => (current > 0 ? current - 1 : 0)),
      1_000,
    );
    return () => clearInterval(timer);
  }, []);

  const plain = remaining > 0 ? t("seconds", { seconds: remaining }) : t("now");

  return <span aria-live="off">{render ? render(remaining) : plain}</span>;
}
