import { formatUtcDateTime, toIsoInstant } from "@/src/lib/date/format";
import { cn } from "@/src/lib/utils";

/** An instant as "25 Sep 2026, 14:32 UTC", machine-readable in `dateTime`. */
export function LogTime({ value, className }: { value: string; className?: string }) {
  return (
    <time dateTime={toIsoInstant(value)} className={cn("ui:whitespace-nowrap", className)}>
      {formatUtcDateTime(value)}
    </time>
  );
}
