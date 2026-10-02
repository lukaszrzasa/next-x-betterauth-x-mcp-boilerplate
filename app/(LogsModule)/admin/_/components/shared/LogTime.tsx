"use client";

import { useFormatter } from "next-intl";
import { toIsoInstant } from "@/src/lib/date/format";
import { cn } from "@/src/lib/utils";

/** An instant as "Sep 25, 2026 at 02:32 PM UTC" in the viewer's language, machine-readable in `dateTime`. */
export function LogTime({ value, className }: { value: string; className?: string }) {
  const format = useFormatter();
  return (
    <time dateTime={toIsoInstant(value)} className={cn("ui:whitespace-nowrap", className)}>
      {format.dateTime(new Date(value), "dateTime")}
    </time>
  );
}
