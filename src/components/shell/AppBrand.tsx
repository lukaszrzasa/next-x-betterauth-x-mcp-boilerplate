import Link from "next/link";
import { appRoutes } from "@/src/lib/app/routes";
import { appName } from "@/src/lib/config";
import { cn } from "@/src/lib/utils";

/** The product mark and name, linked to the homepage. `compact` keeps only the mark visible. */
export function AppBrand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={appRoutes.home.href}
      aria-label={compact ? appName : undefined}
      className={cn(
        "ui:flex ui:min-w-0 ui:items-center ui:gap-2.5 ui:text-xl ui:font-bold ui:tracking-tight",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="ui:grid ui:size-8 ui:shrink-0 ui:place-items-center ui:rounded-lg ui:bg-primary ui:text-primary-foreground"
      >
        B
      </span>
      <span className={cn("ui:truncate", compact && "ui:sr-only")}>{appName}</span>
    </Link>
  );
}
