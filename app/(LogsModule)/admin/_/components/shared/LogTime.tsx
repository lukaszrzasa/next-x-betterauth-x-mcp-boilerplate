"use client";

import { useLocale } from "next-intl";
import { formatUtcDateTime } from "@/src/lib/date/format";
import { toIsoInstant } from "@/src/lib/date/format";
import { cn } from "@/src/lib/utils";

/** An instant as "Sep 25, 2026 at 02:32 PM UTC" in the viewer's language, machine-readable in `dateTime`. */
export function LogTime({ value, className }: { value: string; className?: string }) {
  const locale = useLocale();
  return (
    <time dateTime={toIsoInstant(value)} className={cn("ui:whitespace-nowrap", className)}>
      {formatUtcDateTime(value, locale)}
    </time>
  );
}
