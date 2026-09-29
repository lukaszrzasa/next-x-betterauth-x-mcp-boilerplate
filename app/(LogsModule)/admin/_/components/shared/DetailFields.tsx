import type { ReactNode } from "react";

/** Labelled read-only values in a dialog section: two columns from `sm`, stacked on phones. */
export function DetailFields({ children }: { children: ReactNode }) {
  return <dl className="ui:grid ui:grid-cols-1 ui:gap-x-6 ui:gap-y-3 ui:sm:grid-cols-2">{children}</dl>;
}

export function DetailField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "ui:min-w-0 ui:sm:col-span-2" : "ui:min-w-0"}>
      <dt className="ui:text-xs ui:text-muted-foreground">{label}</dt>
      <dd className="ui:ms-0 ui:mt-0.5 ui:text-sm ui:break-words">{children}</dd>
    </div>
  );
}

/** A heading-led block inside the dialog body. */
export function DialogSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ui:flex ui:flex-col ui:gap-3">
      <h3 className="ui:text-sm ui:font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** An opaque identifier: monospace, wrappable, selectable. */
export function Identifier({ value }: { value: string }) {
  return <code className="ui:font-mono ui:text-xs ui:break-all">{value}</code>;
}
