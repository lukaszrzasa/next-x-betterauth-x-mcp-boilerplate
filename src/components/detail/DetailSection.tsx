import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/src/lib/utils";

/**
 * One section of a detail page: a card with a real `<h2>` the section is
 * labelled by, an optional description, an actions slot and its content.
 * Independent sections stack or sit in columns; nothing here knows about
 * tabs, permissions or the entity being shown.
 */
export function DetailSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  const descriptionId = useId();

  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "ui:flex ui:flex-col ui:gap-5 ui:rounded-xl ui:border ui:bg-card ui:p-5 ui:text-card-foreground ui:shadow-sm ui:sm:p-6",
        className,
      )}
    >
      <header className="ui:flex ui:flex-wrap ui:items-start ui:justify-between ui:gap-3">
        <div className="ui:flex ui:min-w-0 ui:items-start ui:gap-3">
          <span
            aria-hidden="true"
            className="ui:flex ui:size-9 ui:shrink-0 ui:items-center ui:justify-center ui:rounded-lg ui:bg-muted ui:text-muted-foreground"
          >
            <Icon className="ui:size-4" />
          </span>
          <div className="ui:min-w-0">
            <h2 id={headingId} className="ui:text-base ui:leading-9 ui:font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="ui:-mt-1 ui:text-sm ui:text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="ui:flex ui:flex-wrap ui:items-center ui:gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** A labelled read-only value inside a section: label above, value below, optional control beside. */
export function DetailRow({
  label,
  children,
  control,
  className,
}: {
  label: string;
  children: ReactNode;
  control?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ui:flex ui:flex-col ui:gap-2 ui:border-t ui:py-4 ui:first:border-t-0 ui:first:pt-0 ui:last:pb-0 ui:sm:flex-row ui:sm:items-start ui:sm:justify-between ui:sm:gap-6",
        className,
      )}
    >
      <div className="ui:min-w-0 ui:flex-1">
        <p className="ui:text-sm ui:text-muted-foreground">{label}</p>
        <div className="ui:mt-0.5 ui:min-w-0 ui:text-sm ui:break-words">{children}</div>
      </div>
      {control && <div className="ui:flex ui:shrink-0 ui:flex-wrap ui:gap-2">{control}</div>}
    </div>
  );
}
