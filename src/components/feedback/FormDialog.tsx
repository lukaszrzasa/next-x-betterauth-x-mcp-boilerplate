"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

/**
 * A modal that hosts one form or short flow: title, optional description,
 * and whatever the caller renders (its own fields and buttons). Closing by
 * Escape, the overlay or the X is refused while `pending`, so a submission
 * in flight cannot be orphaned; the caller's Cancel button calls
 * `onOpenChange(false)` itself. Portaled with `.app-ui`, like every dialog.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  pending = false,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  pending?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className={className} showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
