"use client";

import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/** A declared route works as an item directly; the last item is never linked. */
export type BreadcrumbItem = {
  /**
   * A catalog key (`nav.*`, as route tables declare) rendered through the
   * catalog, or text already in the viewer's language (a user's name).
   */
  label: string;
  /** Linked when present and not the last item; plain text otherwise. */
  href?: string;
};

export type AppBreadcrumbsProps = {
  items: readonly BreadcrumbItem[];
};

/**
 * Renders the breadcrumb a page declares for itself. Pages own their trail
 * explicitly, so there is no path parser, context or registration effect to
 * keep in sync with the route tree.
 */
export function AppBreadcrumbs({ items }: AppBreadcrumbsProps) {
  const t = useTranslations();
  const text = (label: string) => (t.has(label as never) ? t(label as never) : label);

  return (
    <nav aria-label={t("common.shell.breadcrumb")}>
      <ol className="ui:flex ui:flex-wrap ui:items-center ui:gap-1.5 ui:text-sm ui:text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          const label = text(item.label);

          return (
            <li key={`${index}-${item.label}`} className="ui:flex ui:items-center ui:gap-1.5">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="ui:transition-colors ui:hover:text-foreground"
                >
                  {label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "ui:text-foreground" : undefined}
                >
                  {label}
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
