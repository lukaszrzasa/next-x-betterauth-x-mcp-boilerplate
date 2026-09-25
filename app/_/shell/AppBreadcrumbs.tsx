import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

/** A declared route works as an item directly; the last item is never linked. */
export type BreadcrumbItem = {
  label: string;
  /** Linked when present and not the last item; plain text otherwise. */
  href?: string;
};

export type AppBreadcrumbsProps = {
  items: readonly BreadcrumbItem[];
};

/**
 * Renders the breadcrumb a page declares for itself. Server-compatible on
 * purpose: pages own their trail explicitly, so there is no path parser,
 * context or registration effect to keep in sync with the route tree.
 */
export function AppBreadcrumbs({ items }: AppBreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="ui:flex ui:flex-wrap ui:items-center ui:gap-1.5 ui:text-sm ui:text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;

          return (
            <li key={`${index}-${item.label}`} className="ui:flex ui:items-center ui:gap-1.5">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="ui:transition-colors ui:hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "ui:text-foreground" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last && (
                <ChevronRightIcon aria-hidden="true" className="ui:size-3.5" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
