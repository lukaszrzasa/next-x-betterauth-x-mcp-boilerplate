"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Skeleton } from "@/src/components/ui/skeleton";

/**
 * The shell both log dialogs share: at most 56rem wide, bounded by the
 * viewport with its body scrolling inside, an accessible title and
 * description, Radix's focus trap, and a caller-owned focus restoration
 * (`onCloseAutoFocus`). It stays mounted while a record loads, so the
 * loading state appears inside the open dialog.
 */
export function LogDialogFrame({
  open,
  title,
  description,
  onClose,
  onCloseAutoFocus,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
  children: ReactNode;
}) {
  const t = useTranslations("common.actions");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="ui:flex ui:max-h-[calc(100dvh-2rem)] ui:flex-col ui:gap-0 ui:p-0 ui:sm:max-w-4xl"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader className="ui:border-b ui:p-5 ui:pr-12 ui:text-left ui:sm:p-6 ui:sm:pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="ui:min-h-0 ui:flex-1 ui:overflow-y-auto ui:p-5 ui:sm:p-6">{children}</div>
        <DialogFooter className="ui:border-t ui:p-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What the dialog body shows while a record loads. */
export function LogDialogLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="ui:flex ui:flex-col ui:gap-4">
      <div className="ui:grid ui:grid-cols-1 ui:gap-3 ui:sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="ui:h-9" />
        ))}
      </div>
      <Skeleton className="ui:h-40" />
      <span className="ui:sr-only">{label}…</span>
    </div>
  );
}

/** Terminal states of a load, each with its one sensible action. */
export function LogDialogMessage({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="ui:flex ui:flex-col ui:items-start ui:gap-3 ui:py-6">
      <div className="ui:flex ui:flex-col ui:gap-1">
        <p className="ui:font-medium">{title}</p>
        <p className="ui:text-sm ui:text-muted-foreground">{message}</p>
      </div>
      {action}
    </div>
  );
}

/** Shown when a directly linked or history-selected record falls outside the current list criteria. */
export function OutsideCriteriaNote() {
  const t = useTranslations("logsAdmin.shared.dialog");
  return (
    <p className="ui:mb-4 ui:rounded-md ui:border ui:border-dashed ui:px-3 ui:py-2 ui:text-sm ui:text-muted-foreground">
      {t("outsideCriteria")}
    </p>
  );
}
